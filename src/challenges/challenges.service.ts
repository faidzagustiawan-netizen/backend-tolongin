import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { TokensService } from '../tokens/tokens.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CompaniesService } from '../companies/companies.service';
import { SkillsService } from '../skills/skills.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { UpdateChallengeDto } from './dto/update-challenge.dto';
import { UpdateStageGateDto } from './dto/update-stage-gate.dto';
import { GenerateAiChallengeDto } from './dto/generate-ai-challenge.dto';
import { GenerateAiBlueprintDto } from './dto/generate-ai-blueprint.dto';
import { ChallengeSectionDto } from './dto/create-challenge.dto';
import { DISCUSSION_AUTHOR_SELECT } from '../common/selects/discussion-author.select';
import {
  CHALLENGE_CATEGORY_SELECT,
  flattenCategories,
  flattenCategory,
} from '../common/selects/challenge-category.select';
import { subscriptionLimitsEnforced } from '../common/dev-flags';
import { assertPsychometricMetadata } from '../submissions/psychometric';
import {
  ChallengeDifficulty,
  ChallengeStatus,
  ChallengeType,
  ComponentType,
  GateScoreBasis,
  Prisma,
  Role,
  StageGateMode,
  StagePendingPolicy,
} from '@prisma/client';
import crypto from 'crypto';

/**
 * Bentuk minimal yang dibutuhkan pemeriksaan konsistensi. Sengaja longgar
 * supaya satu fungsi bisa memeriksa section yang datang dari badan permintaan
 * maupun yang dibaca kembali dari basis data.
 */
type ValidatableComponent = {
  type: ComponentType;
  question: string;
  options?: unknown;
  metadata?: unknown;
};

type ValidatableSection = {
  id?: string;
  title?: string | null;
  order?: number | null;
  opensAt?: string | Date | null;
  closesAt?: string | Date | null;
  gateMode?: StageGateMode | null;
  minScore?: number | null;
  maxAdvancing?: number | null;
  scoreBasis?: GateScoreBasis | null;
  gateSourceIds?: string[] | null;
  pendingPolicy?: StagePendingPolicy | null;
  graceDays?: number | null;
  components?: ValidatableComponent[] | null;
};

@Injectable()
export class ChallengesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly tokensService: TokensService,
    private readonly notificationsService: NotificationsService,
    private readonly companiesService: CompaniesService,
    private readonly skillsService: SkillsService,
  ) {}

  private readonly logger = new Logger(ChallengesService.name);

  /** Biaya token untuk satu Public Challenge yang dibuat talenta. */
  private static readonly PUBLIC_CHALLENGE_COST = 50;

  /** Berapa banyak Public Challenge aktif/draf yang boleh dimiliki talenta. */
  private static readonly MAX_ACTIVE_PUBLIC_CHALLENGES = 3;

  /** Batas percobaan mencari slug yang belum terpakai. */
  private static readonly SLUG_ATTEMPTS = 5;

  /** Banyaknya nama bidang yang boleh dipakai sekali menyaring direktori. */
  private static readonly MAX_FILTER_NAMES = 20;

  /**
   * Transaksi pembuatan challenge menulis satu challenge beserta seluruh
   * section dan komponennya, jadi batas bawaan Prisma (5 detik) terlalu ketat
   * untuk soal yang panjang.
   */
  private static readonly TX_TIMEOUT_MS = 20000;

  /**
   * Kolom skalar satu section. Dipisahkan dari pembangun nested-write supaya
   * jalur create dan jalur update menuliskan himpunan kolom yang sama — kolom
   * baru yang hanya ditambahkan di salah satunya adalah cara paling mudah
   * kehilangan pengaturan tanpa jejak.
   */
  private buildSectionScalarData(s: ChallengeSectionDto, sIdx: number) {
    return {
      title: s.title,
      description: s.description,
      order: s.order ?? sIdx,
      timeLimit: s.timeLimit ?? null,
      opensAt: s.opensAt ? new Date(s.opensAt) : null,
      closesAt: s.closesAt ? new Date(s.closesAt) : null,
      gateMode: s.gateMode ?? StageGateMode.OPEN,
      minScore: s.minScore ?? null,
      maxAdvancing: s.maxAdvancing ?? null,
      scoreBasis: s.scoreBasis ?? GateScoreBasis.PREVIOUS_STAGE,
      gateSourceIds: s.gateSourceIds ?? [],
      pendingPolicy: s.pendingPolicy ?? StagePendingPolicy.WAIT_FOR_SCORE,
      graceDays: s.graceDays ?? null,
    };
  }

  /** Batas wajar sekali serap; melindungi transaksi dari studi kasus raksasa. */
  private static readonly MAX_ABSORBED_QUESTIONS = 200;

  /**
   * Menyalin soal tulisan sendiri ke koleksi perusahaan saat diterbitkan.
   *
   * Bank soal tidak akan pernah tumbuh kalau mengisinya adalah pekerjaan
   * terpisah di atas pekerjaan yang sudah berat. Sebelumnya satu-satunya cara
   * adalah menekan ikon penanda pada tiap soal, satu per satu, tanpa satu pun
   * petunjuk apa gunanya — jadi hampir tidak ada yang melakukannya.
   *
   * Yang diserap hanya soal yang benar-benar ditulis sendiri: `sourceItemId`
   * kosong berarti bukan hasil memungut dari bank. Sesudah tersalin, komponennya
   * ditautkan ke salinan bank itu, sehingga penerbitan ulang tidak menggandakan
   * dan jumlah pemakaian soal bisa dihitung.
   *
   * Bidang studi kasus diturunkan apa adanya ke soal yang diserap; studi kasus
   * tanpa bidang menghasilkan soal lintas bidang (`categoryId` null), yang
   * memang paling luas dipakai.
   */
  private async absorbSelfWrittenQuestions(
    tx: Prisma.TransactionClient,
    challengeId: string,
    companyId: string,
  ): Promise<number> {
    const challenge = await tx.challenge.findUnique({
      where: { id: challengeId },
      select: { categoryId: true, difficulty: true },
    });
    if (!challenge) return 0;

    const components = await tx.challengeComponent.findMany({
      where: { section: { challengeId }, sourceItemId: null },
      select: {
        id: true,
        type: true,
        question: true,
        description: true,
        options: true,
        metadata: true,
        points: true,
      },
      take: ChallengesService.MAX_ABSORBED_QUESTIONS,
    });

    const writable = components.filter((c) => c.question.trim().length > 0);
    if (writable.length === 0) return 0;

    // Soal yang teksnya sudah ada di koleksi tidak digandakan — perusahaan
    // yang memakai pertanyaan yang sama di dua studi kasus tidak sedang
    // meminta dua entri bank.
    const existing = await tx.questionBankItem.findMany({
      where: { companyId, question: { in: writable.map((c) => c.question) } },
      select: { id: true, question: true },
    });
    const idByQuestion = new Map(existing.map((i) => [i.question, i.id]));

    let created = 0;

    for (const comp of writable) {
      let itemId = idByQuestion.get(comp.question);

      if (!itemId) {
        const item = await tx.questionBankItem.create({
          data: {
            companyId,
            type: comp.type,
            question: comp.question,
            description: comp.description,
            options: comp.options ?? undefined,
            metadata: comp.metadata ?? undefined,
            defaultPoints: comp.points ?? 10,
            categoryId: challenge.categoryId,
            difficulty: challenge.difficulty,
          },
          select: { id: true },
        });

        itemId = item.id;
        idByQuestion.set(comp.question, itemId);
        created += 1;
      }

      await tx.challengeComponent.update({
        where: { id: comp.id },
        data: { sourceItemId: itemId },
      });
    }

    return created;
  }

  private buildComponentsCreateInput(
    challengeId: string,
    components?: ChallengeSectionDto['components'],
  ) {
    if (!components || components.length === 0) return undefined;

    return {
      create: components.map((c, cIdx) => ({
        challengeId,
        type: c.type,
        question: c.question,
        description: c.description,
        options: c.options ?? undefined,
        metadata: c.metadata ?? undefined,
        points: c.points ?? 10,
        order: c.order ?? cIdx,
        sourceItemId: c.sourceItemId ?? null,
      })),
    };
  }

  /**
   * Bentuk nested-create untuk section beserta komponennya. Dipakai bersama
   * oleh create dan createPublic; jalur update memakai `writeSections` karena
   * harus mempertahankan id section yang sudah ada.
   */
  private buildSectionsCreateInput(
    challengeId: string,
    sections?: ChallengeSectionDto[],
  ) {
    if (!sections || sections.length === 0) return undefined;

    return {
      create: sections.map((s, sIdx) => ({
        ...this.buildSectionScalarData(s, sIdx),
        components: this.buildComponentsCreateInput(challengeId, s.components),
      })),
    };
  }

  /**
   * Menulis ulang daftar section sambil mempertahankan id yang sudah ada.
   *
   * Dulu di sini cukup `deleteMany: {}` lalu create ulang, sehingga setiap
   * penyimpanan draf mengganti seluruh `ChallengeSection.id`. Itu tidak
   * terlihat selama section hanya berisi soal, tetapi pengaturan syarat masuk
   * antar-tahap menunjuk tahap lain lewat id — dengan pola lama, rujukan itu
   * membusuk begitu company menekan simpan sekali lagi.
   *
   * Ketiga operasi dijalankan terpisah, bukan sebagai satu nested write,
   * supaya urutannya pasti: hapus dulu, baru buat. Pada satu nested write
   * `deleteMany` yang berjalan setelah `create` akan menghapus section yang
   * baru saja dibuat.
   */
  private async writeSections(
    tx: Prisma.TransactionClient,
    challengeId: string,
    sections: ChallengeSectionDto[],
    existingSectionIds: Set<string>,
  ) {
    // Id hanya dipercaya bila memang milik challenge ini. Tanpa penyaringan
    // itu klien bisa menyebut id section milik perusahaan lain dan menuliskan
    // isinya lewat jalur update.
    const kept = sections
      .map((s) => s.id)
      .filter((id): id is string => !!id && existingSectionIds.has(id));

    await tx.challengeSection.deleteMany({
      where: {
        challengeId,
        // `notIn: []` tidak menyaring apa pun, jadi daftar kosong sengaja
        // diterjemahkan sebagai "hapus semua" — itulah artinya ketika tidak
        // ada satu pun section lama yang dipertahankan.
        ...(kept.length > 0 ? { id: { notIn: kept } } : {}),
      },
    });

    for (const [sIdx, s] of sections.entries()) {
      const scalars = this.buildSectionScalarData(s, sIdx);
      const components = this.buildComponentsCreateInput(
        challengeId,
        s.components,
      );

      if (s.id && existingSectionIds.has(s.id)) {
        // Komponen tetap dibuang dan ditulis ulang: identitasnya tidak dirujuk
        // oleh apa pun selama challenge masih draf, dan jawaban kandidat baru
        // ada setelah terbit — saat mana penyuntingan sudah ditolak.
        await tx.challengeComponent.deleteMany({ where: { sectionId: s.id } });

        await tx.challengeSection.update({
          where: { id: s.id },
          data: { ...scalars, components },
        });
      } else {
        await tx.challengeSection.create({
          data: { challengeId, ...scalars, components },
        });
      }
    }
  }

  private static readonly DEFAULT_RUBRIC = {
    completeness: 30,
    quality: 40,
    efficiency: 30,
  };

  /**
   * Kunci `gradingRubric` yang bukan kriteria penilaian. Kolom itu dipakai
   * bersama untuk beberapa pengaturan lain, jadi bobot tidak boleh dihitung
   * dari seluruh isinya.
   */
  private static readonly RUBRIC_SYSTEM_KEYS = [
    'proctoringSettings',
    'customOutputs',
    'durationHours',
    'requireProctoring',
  ];

  /**
   * Pemeriksaan syarat masuk antar-tahap, hanya saat penerbitan.
   *
   * Semua aturan di sini menjawab satu pertanyaan yang sama: apakah masih ada
   * jalan bagi kandidat untuk sampai ke tahap terakhir? Gerbang yang salah
   * setel tidak memunculkan galat apa pun saat dibuat — akibatnya baru terlihat
   * berhari-hari kemudian, ketika kandidat terkunci dan studi kasus yang sudah
   * terbit tidak bisa lagi disunting.
   */
  private assertStageGatesConsistent(
    sections: ValidatableSection[],
    challengeStartsAt: Date | null,
    challengeDeadlineAt: Date | null,
  ) {
    const ordered = sections
      .map((section, idx) => ({ section, order: section.order ?? idx }))
      .sort((a, b) => a.order - b.order);

    const label = (section: ValidatableSection, order: number) =>
      section.title?.trim()
        ? `"${section.title.trim()}"`
        : `urutan ${order + 1}`;

    // Id tahap yang boleh dirujuk: hanya yang sudah tersimpan. Tahap baru belum
    // punya id, jadi belum bisa menjadi sumber nilai bagi tahap lain.
    const orderById = new Map<string, number>();
    for (const { section, order } of ordered) {
      if (section.id) orderById.set(section.id, order);
    }

    for (const [idx, { section, order }] of ordered.entries()) {
      const name = label(section, order);
      const gateMode = section.gateMode ?? StageGateMode.OPEN;
      const opensAt = section.opensAt ? new Date(section.opensAt) : null;
      const closesAt = section.closesAt ? new Date(section.closesAt) : null;

      if (opensAt && closesAt && closesAt <= opensAt) {
        throw new BadRequestException(
          `Tahap ${name}: waktu tutup harus lebih lambat daripada waktu buka.`,
        );
      }
      // Jendela tahap di luar jendela challenge berarti tahap yang tidak pernah
      // bisa dikerjakan: challenge sudah tertutup sebelum tahapnya terbuka.
      if (challengeStartsAt && opensAt && opensAt < challengeStartsAt) {
        throw new BadRequestException(
          `Tahap ${name}: waktu buka tidak boleh lebih awal daripada tanggal mulai challenge.`,
        );
      }
      if (challengeDeadlineAt && closesAt && closesAt > challengeDeadlineAt) {
        throw new BadRequestException(
          `Tahap ${name}: waktu tutup tidak boleh melewati batas akhir challenge.`,
        );
      }

      // Tahap pertama tidak punya tahap sebelumnya, jadi syarat apa pun di sana
      // menutup studi kasus untuk semua orang.
      if (idx === 0 && gateMode !== StageGateMode.OPEN) {
        throw new BadRequestException(
          `Tahap ${name} adalah tahap pertama, jadi syarat masuknya harus terbuka untuk semua kandidat.`,
        );
      }

      if (gateMode === StageGateMode.MIN_SCORE && section.minScore == null) {
        throw new BadRequestException(
          `Tahap ${name}: nilai minimal harus diisi bila syarat masuknya berbasis nilai.`,
        );
      }

      if (gateMode === StageGateMode.TOP_N) {
        if (section.maxAdvancing == null) {
          throw new BadRequestException(
            `Tahap ${name}: jumlah kandidat yang lolos harus diisi bila syarat masuknya berbentuk kuota.`,
          );
        }
        // Peringkat baru bermakna setelah semua kandidat menyelesaikan tahap
        // sumbernya. Tanpa waktu tutup tidak ada saat yang bisa dipakai untuk
        // memutuskan siapa sepuluh teratas.
        if (!closesAt) {
          throw new BadRequestException(
            `Tahap ${name}: kuota hanya bisa diputuskan setelah tahap ditutup, jadi waktu tutup harus diisi.`,
          );
        }
      }

      if (
        section.pendingPolicy === StagePendingPolicy.AUTO_ADVANCE_AFTER &&
        section.graceDays == null
      ) {
        throw new BadRequestException(
          `Tahap ${name}: jumlah hari tunggu harus diisi bila tahap dibuka otomatis saat penilaian terlambat.`,
        );
      }

      // Gerbang berbasis nilai butuh sumber nilai. Sisanya tidak membaca nilai
      // sama sekali, jadi pemeriksaan sumber tidak berlaku.
      const readsScore =
        gateMode === StageGateMode.MIN_SCORE ||
        gateMode === StageGateMode.TOP_N;
      if (!readsScore) continue;

      const scoreBasis = section.scoreBasis ?? GateScoreBasis.PREVIOUS_STAGE;

      if (scoreBasis === GateScoreBasis.SPECIFIC_STAGES) {
        const sources = section.gateSourceIds ?? [];
        if (sources.length === 0) {
          throw new BadRequestException(
            `Tahap ${name}: pilih minimal satu tahap yang nilainya dipakai sebagai syarat.`,
          );
        }
        for (const sourceId of sources) {
          const sourceOrder = orderById.get(sourceId);
          if (sourceOrder === undefined) {
            throw new BadRequestException(
              `Tahap ${name}: ada tahap sumber nilai yang sudah tidak ada. Pilih ulang tahapnya.`,
            );
          }
          // Tahap yang merujuk tahap sesudahnya membuat dua tahap saling
          // menunggu, dan kandidat terkunci permanen tanpa satu pun galat.
          if (sourceOrder >= order) {
            throw new BadRequestException(
              `Tahap ${name}: nilai syarat hanya boleh diambil dari tahap yang dikerjakan lebih dulu.`,
            );
          }
        }
        continue;
      }

      // PREVIOUS_STAGE dan CUMULATIVE membaca tahap sebelumnya. Bila tahap itu
      // seluruhnya psikometrik, tidak ada nilai benar-salah untuk dibandingkan
      // dengan ambang apa pun — skala Likert tidak punya jawaban benar.
      const previous = ordered[idx - 1]?.section;
      const previousComponents = previous?.components ?? [];
      const previousScorable = previousComponents.some(
        (c) => c.type !== ComponentType.PSYCHOMETRIC,
      );

      if (previousComponents.length > 0 && !previousScorable) {
        throw new BadRequestException(
          `Tahap ${name}: tahap sebelumnya hanya berisi soal psikometrik, yang tidak menghasilkan nilai benar-salah. Pilih tahap sumber nilai yang lain.`,
        );
      }
    }
  }

  /**
   * Pemeriksaan yang tidak bisa dinyatakan lewat dekorator class-validator
   * karena melibatkan hubungan antar-field.
   *
   * Aturan ketat soal (opsi pilihan ganda, bobot rubrik) hanya berlaku saat
   * studi kasus benar-benar diterbitkan. Draf sengaja dibiarkan setengah jadi
   * — memaksa kelengkapan di sana membuat tombol "Simpan ke Draf" menolak
   * pekerjaan yang memang belum selesai.
   */
  private assertChallengeConsistency(
    dto: UpdateChallengeDto,
    existing?: {
      status?: ChallengeStatus;
      startsAt: Date | null;
      deadlineAt: Date | null;
      sections?: ValidatableSection[];
    },
  ) {
    const startsAt = dto.startsAt
      ? new Date(dto.startsAt)
      : (existing?.startsAt ?? null);
    const deadlineAt = dto.deadlineAt
      ? new Date(dto.deadlineAt)
      : (existing?.deadlineAt ?? null);

    if (startsAt && deadlineAt && deadlineAt <= startsAt) {
      throw new BadRequestException(
        'Batas akhir harus lebih lambat daripada tanggal mulai.',
      );
    }

    // Status yang berlaku setelah penulisan: yang diminta, kalau tidak ada
    // yang sudah tersimpan, dan barulah PUBLISHED sebagai bawaan pembuatan.
    // Tanpa lapisan tengah itu, setiap penyimpanan draf yang tidak menyebut
    // status ikut diperlakukan sebagai penerbitan.
    const effectiveStatus =
      dto.status ?? existing?.status ?? ChallengeStatus.PUBLISHED;

    if (effectiveStatus !== ChallengeStatus.PUBLISHED) return;

    // Yang diperiksa adalah section yang benar-benar akan tersimpan. Bila
    // permintaan tidak menyertakan `sections`, yang berlaku adalah isi basis
    // data — tanpa ini `PATCH { status: 'PUBLISHED' }` polos melewati seluruh
    // pemeriksaan di bawah karena daftarnya dianggap kosong, dan soal pilihan
    // ganda yang rusak ikut terbit.
    const sections: ValidatableSection[] =
      dto.sections ?? existing?.sections ?? [];

    if (sections.length === 0) {
      throw new BadRequestException(
        'Studi kasus harus memiliki minimal satu tahap sebelum diterbitkan.',
      );
    }

    const hasComponents = sections.some((s) => (s.components?.length ?? 0) > 0);

    for (const section of sections) {
      for (const component of section.components ?? []) {
        // Soal psikotes tidak punya opsi jawaban benar, tetapi skalanya harus
        // sah — tanpa dimensi dan batas skala, jawabannya tidak bisa
        // diringkas menjadi profil apa pun setelah kandidat mengerjakannya.
        if (component.type === ComponentType.PSYCHOMETRIC) {
          assertPsychometricMetadata(component.question, component.metadata);
          continue;
        }

        if (component.type !== ComponentType.MULTIPLE_CHOICE) continue;

        const options = Array.isArray(component.options)
          ? component.options
          : [];

        if (options.length < 2) {
          throw new BadRequestException(
            `Soal pilihan ganda "${component.question}" harus memiliki minimal 2 opsi jawaban.`,
          );
        }
        if (options.some((o: any) => !String(o?.text ?? '').trim())) {
          throw new BadRequestException(
            `Ada opsi jawaban kosong pada soal pilihan ganda "${component.question}".`,
          );
        }
        if (options.filter((o: any) => o?.isCorrect === true).length !== 1) {
          throw new BadRequestException(
            `Soal pilihan ganda "${component.question}" harus memiliki tepat satu jawaban benar.`,
          );
        }
      }
    }

    this.assertStageGatesConsistent(sections, startsAt, deadlineAt);

    // Bobot rubrik hanya dipakai saat penilaian bersifat holistik. Begitu ada
    // soal, skor dihitung dari poin tiap soal dan rubrik tidak lagi mengikat —
    // memaksanya berjumlah 100 di situ hanya akan menghalangi tanpa alasan.
    if (hasComponents) return;

    const rubric = dto.gradingRubric;
    if (!rubric) return;

    const weights = Object.entries(rubric)
      .filter(([key]) => !ChallengesService.RUBRIC_SYSTEM_KEYS.includes(key))
      .map(([, value]) => value);

    if (weights.length === 0) return;

    if (weights.some((w) => typeof w !== 'number' || w < 0)) {
      throw new BadRequestException(
        'Setiap bobot kriteria penilaian harus berupa angka tidak negatif.',
      );
    }

    const total = weights.reduce((acc: number, w: any) => acc + w, 0);
    if (total !== 100) {
      throw new BadRequestException(
        `Total bobot kriteria penilaian harus 100%, saat ini ${total}%.`,
      );
    }
  }

  /**
   * Mengunci baris perusahaan untuk sisa transaksi.
   *
   * Tanpa penguncian, dua permintaan bersamaan sama-sama membaca hitungan
   * challenge yang lama dan sama-sama lolos pemeriksaan kuota, sehingga batas
   * paket bisa dilewati. Lock membuat keduanya mengantre.
   */
  private async lockCompany(tx: Prisma.TransactionClient, companyId: string) {
    await tx.$queryRaw`SELECT id FROM "company_profiles" WHERE id = ${companyId} FOR UPDATE`;

    const company = await tx.companyProfile.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Perusahaan tidak ditemukan');

    return company;
  }

  /**
   * Mengunci profil talenta lalu memastikan kuota Public Challenge aktif belum
   * terlampaui.
   *
   * Biaya token saja bukan rem yang memadai: talenta bersaldo besar bisa
   * membanjiri direktori publik, dan tiap challenge berbayar itu memicu
   * pekerjaan AI di sisi kami.
   */
  private async lockTalentAndAssertQuota(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM "talent_profiles" WHERE "userId" = ${userId} FOR UPDATE`;

    const talent = await tx.talentProfile.findUnique({ where: { userId } });
    if (!talent) {
      throw new NotFoundException('Profil Talenta tidak ditemukan');
    }

    const activeCount = await tx.challenge.count({
      where: {
        talentId: talent.id,
        status: { in: [ChallengeStatus.DRAFT, ChallengeStatus.PUBLISHED] },
      },
    });

    if (activeCount >= ChallengesService.MAX_ACTIVE_PUBLIC_CHALLENGES) {
      throw new ForbiddenException(
        `Anda hanya dapat memiliki ${ChallengesService.MAX_ACTIVE_PUBLIC_CHALLENGES} Public Challenge aktif atau draf sekaligus. Terbitkan, selesaikan, atau hapus salah satunya terlebih dahulu.`,
      );
    }

    return talent;
  }

  /** Memastikan kuota studi kasus aktif/draf paket belum terlampaui. */
  private async assertCompanyQuota(
    tx: Prisma.TransactionClient,
    company: { id: string; subscriptionTier: string },
  ) {
    const activeCount = await tx.challenge.count({
      where: {
        companyId: company.id,
        status: { in: [ChallengeStatus.DRAFT, ChallengeStatus.PUBLISHED] },
      },
    });

    if (!subscriptionLimitsEnforced()) {
      return;
    }

    if (company.subscriptionTier === 'STARTUP' && activeCount >= 1) {
      throw new ForbiddenException(
        'Paket Murah hanya mengizinkan 1 studi kasus aktif/draf. Silakan tingkatkan langganan Anda.',
      );
    }
    if (company.subscriptionTier === 'KONGLOMERAT' && activeCount >= 5) {
      throw new ForbiddenException(
        'Paket Pro hanya mengizinkan 5 studi kasus aktif/draf. Silakan tingkatkan langganan Anda.',
      );
    }
  }

  async create(
    companyId: string,
    createChallengeDto: CreateChallengeDto,
    userId: string,
  ) {
    this.assertChallengeConsistency(createChallengeDto);

    // Sengaja di luar transaksi: penambahan baris direktori tidak boleh ikut
    // dibatalkan kalau kuota perusahaan ternyata habis, dan bidang yang sudah
    // sempat dipakai tetap berguna bagi perusahaan berikutnya.
    const categoryId = await this.skillsService.resolveCategoryId(
      createChallengeDto.category,
    );

    const newChallenge = await this.withSlugRetry(
      createChallengeDto.title,
      (slug) =>
        this.prisma.$transaction(
          async (tx) => {
            const company = await this.lockCompany(tx, companyId);
            await this.assertCompanyQuota(tx, company);
            const challengeId = crypto.randomUUID();

            const challenge = await tx.challenge.create({
              data: {
                id: challengeId,
                companyId,
                title: createChallengeDto.title,
                slug,
                summary: createChallengeDto.summary,
                description: createChallengeDto.description,
                role: createChallengeDto.role ?? null,
                categoryId,
                difficulty: createChallengeDto.difficulty,
                datasetUrl: createChallengeDto.datasetUrl,
                mockApiUrl: createChallengeDto.mockApiUrl,
                brandGuidelineUrl: createChallengeDto.brandGuidelineUrl,
                gradingRubric:
                  createChallengeDto.gradingRubric ??
                  ChallengesService.DEFAULT_RUBRIC,
                proctoringSettings:
                  createChallengeDto.proctoringSettings ?? undefined,
                rewardDescription: this.generateSystemRewardDescription(
                  createChallengeDto.difficulty,
                ),
                startsAt: createChallengeDto.startsAt
                  ? new Date(createChallengeDto.startsAt)
                  : null,
                deadlineAt: createChallengeDto.deadlineAt
                  ? new Date(createChallengeDto.deadlineAt)
                  : null,
                isPrivate: createChallengeDto.isPrivate ?? false,
                status: createChallengeDto.status ?? ChallengeStatus.PUBLISHED,
                createdByAi: createChallengeDto.createdByAi ?? false,
                aiPromptUsed: createChallengeDto.aiPromptUsed,
                challengeType: ChallengeType.COMPANY,
                sections: this.buildSectionsCreateInput(
                  challengeId,
                  createChallengeDto.sections,
                ),
              },
              // Id tahap ikut dikembalikan supaya builder menyimpannya dan
              // penyimpanan berikutnya memperbarui baris yang sama alih-alih
              // membuat ulang seluruh tahap.
              include: {
                sections: {
                  select: { id: true, order: true },
                  orderBy: { order: 'asc' },
                },
              },
            });

            // Koleksi soal tumbuh dari pekerjaan yang memang sudah dilakukan.
            // Hanya saat benar-benar terbit: draf masih akan berubah, dan
            // menyerap isinya berarti menabung setengah kalimat.
            if (
              challenge.status === ChallengeStatus.PUBLISHED &&
              createChallengeDto.saveQuestionsToBank !== false
            ) {
              await this.absorbSelfWrittenQuestions(tx, challengeId, companyId);
            }

            await tx.notification.create({
              data: {
                userId: company.userId,
                title: 'Studi Kasus Diterbitkan',
                content: `Studi Kasus "${challenge.title}" berhasil ${challenge.status === ChallengeStatus.DRAFT ? 'disimpan sebagai draft' : 'diterbitkan'}.`,
                linkUrl: `/challenges/${challenge.slug}`,
              },
            });

            return challenge;
          },
          { timeout: ChallengesService.TX_TIMEOUT_MS },
        ),
    );

    // Di luar transaksi: jejak audit yang gagal tidak boleh membatalkan
    // challenge yang sudah sah dibuat.
    await this.companiesService.logAction(
      companyId,
      userId,
      'CHALLENGE_CREATED',
      'CHALLENGE',
      newChallenge.id,
      { title: newChallenge.title, status: newChallenge.status },
    );

    return newChallenge;
  }

  async createPublic(userId: string, createChallengeDto: CreateChallengeDto) {
    this.assertChallengeConsistency(createChallengeDto);

    // Pemotongan token dan pembuatan challenge berada dalam satu transaksi.
    // Sebelumnya token dipotong lebih dulu di transaksinya sendiri, sehingga
    // profil talenta yang tidak ditemukan atau kegagalan penulisan apa pun
    // meninggalkan saldo terpotong tanpa challenge dan tanpa pengembalian.
    const categoryId = await this.skillsService.resolveCategoryId(
      createChallengeDto.category,
    );

    return this.withSlugRetry(createChallengeDto.title, (slug) =>
      this.prisma.$transaction(
        async (tx) => {
          const talentProfile = await this.lockTalentAndAssertQuota(tx, userId);

          await this.tokensService.spendTokensWithin(
            tx,
            userId,
            ChallengesService.PUBLIC_CHALLENGE_COST,
            `Membuat Public Challenge: ${createChallengeDto.title}`,
          );

          const challengeId = crypto.randomUUID();

          const newChallenge = await tx.challenge.create({
            data: {
              id: challengeId,
              talentId: talentProfile.id,
              title: createChallengeDto.title,
              slug,
              summary: createChallengeDto.summary,
              description: createChallengeDto.description,
              role: createChallengeDto.role ?? null,
              categoryId,
              difficulty: createChallengeDto.difficulty,
              datasetUrl: createChallengeDto.datasetUrl,
              mockApiUrl: createChallengeDto.mockApiUrl,
              brandGuidelineUrl: createChallengeDto.brandGuidelineUrl,
              gradingRubric:
                createChallengeDto.gradingRubric ??
                ChallengesService.DEFAULT_RUBRIC,
              proctoringSettings:
                createChallengeDto.proctoringSettings ?? undefined,
              rewardDescription: this.generateSystemRewardDescription(
                createChallengeDto.difficulty,
              ),
              deadlineAt: createChallengeDto.deadlineAt
                ? new Date(createChallengeDto.deadlineAt)
                : null,
              isPrivate: createChallengeDto.isPrivate ?? false,
              status: createChallengeDto.status ?? ChallengeStatus.PUBLISHED,
              createdByAi: createChallengeDto.createdByAi ?? false,
              aiPromptUsed: createChallengeDto.aiPromptUsed,
              challengeType: ChallengeType.PUBLIC,
              sections: this.buildSectionsCreateInput(
                challengeId,
                createChallengeDto.sections,
              ),
            },
            // Sama seperti jalur perusahaan: id tahap dikembalikan supaya
            // builder bisa menyimpannya.
            include: {
              sections: {
                select: { id: true, order: true },
                orderBy: { order: 'asc' },
              },
            },
          });

          await tx.notification.create({
            data: {
              userId: talentProfile.userId,
              title: 'Public Challenge Diterbitkan',
              content: `Public Challenge "${newChallenge.title}" berhasil ${newChallenge.status === ChallengeStatus.DRAFT ? 'disimpan sebagai draft' : 'diterbitkan'}.`,
              linkUrl: `/challenges/${newChallenge.slug}`,
            },
          });

          return newChallenge;
        },
        { timeout: ChallengesService.TX_TIMEOUT_MS },
      ),
    );
  }

  /**
   * Menerima nilai enum tunggal atau daftar dipisah koma ("UI_UX,BACKEND").
   * Nilai yang tidak dikenal dibuang diam-diam agar filter dari klien tidak
   * bisa dipakai menyuntik kondisi yang tidak diharapkan.
   */
  private parseEnumList<T extends string>(
    raw: string | undefined,
    allowed: readonly T[],
  ): T[] | undefined {
    if (!raw) return undefined;
    const values = raw
      .split(',')
      .map((v) => v.trim().toUpperCase())
      .filter((v): v is T => (allowed as readonly string[]).includes(v));
    return values.length > 0 ? values : undefined;
  }

  /**
   * Penyaring bidang pekerjaan datang sebagai nama, bukan enum.
   *
   * `parseEnumList` tidak lagi bisa dipakai untuk bidang: daftar sahnya sekarang
   * isi tabel, bukan konstanta. Yang tersisa untuk dijaga adalah ukurannya —
   * tanpa batas, satu kueri boleh meminta ribuan cabang OR.
   */
  private parseNameList(raw: string | undefined): string[] | undefined {
    if (!raw) return undefined;
    const values = raw
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && v.length <= 60)
      .slice(0, ChallengesService.MAX_FILTER_NAMES);
    return values.length > 0 ? values : undefined;
  }

  async findAll(
    query: {
      category?: string;
      difficulty?: string;
      challengeType?: string;
      search?: string;
      companyId?: string;
      includeDrafts?: string;
      mine?: string;
      sort?: string;
      page?: number;
      limit?: number;
    },
    requester?: { sub?: string; role?: Role; profileId?: string },
  ) {
    // Hanya pemilik challenge yang bersangkutan (atau admin) yang boleh melihat
    // challenge privat dan draft. Tanpa pemeriksaan ini, siapa pun cukup
    // menebak/menyalin companyId untuk membaca soal yang belum terbit.
    const isAdmin = requester?.role === Role.ADMIN;

    // `mine=true` adalah cara pemilik melihat miliknya sendiri tanpa perlu
    // menebak id profilnya. Ini juga satu-satunya cara talenta menemukan
    // Public Challenge miliknya: penyaring lama hanya mengenal companyId,
    // sehingga draf talenta tidak pernah muncul di mana pun.
    const wantsOwn = query.mine === 'true';
    if (wantsOwn && !requester?.profileId) {
      throw new ForbiddenException(
        'Sesi tidak memiliki profil. Silakan masuk ulang.',
      );
    }

    const isCompanyOwner =
      !!query.companyId &&
      !!requester?.profileId &&
      requester.profileId === query.companyId;
    const canSeeRestricted = isAdmin || isCompanyOwner || wantsOwn;

    const where: Prisma.ChallengeWhereInput = {};
    // Syarat yang harus digabung dengan AND supaya tidak saling menimpa:
    // penyaring kepemilikan dan pencarian teks sama-sama memakai OR.
    const and: Prisma.ChallengeWhereInput[] = [];

    if (wantsOwn) {
      and.push({
        OR: [
          { companyId: requester!.profileId },
          { talentId: requester!.profileId },
        ],
      });
    }

    if (!canSeeRestricted) {
      where.isPrivate = false;
    }

    // Studi kasus yang diarsipkan ikut disertakan untuk pemiliknya. Tanpa itu
    // mengarsipkan sama saja dengan menghilangkan: barangnya lenyap dari satu-
    // satunya daftar tempat pemilik bisa menemukannya kembali.
    if (query.includeDrafts === 'true' && canSeeRestricted) {
      where.status = {
        in: [
          ChallengeStatus.PUBLISHED,
          ChallengeStatus.DRAFT,
          ChallengeStatus.CLOSED,
        ],
      };
    } else if (wantsOwn) {
      // Halaman "milik saya" tidak ada gunanya bila draf disembunyikan.
      where.status = {
        in: [
          ChallengeStatus.PUBLISHED,
          ChallengeStatus.DRAFT,
          ChallengeStatus.CLOSED,
        ],
      };
    } else {
      where.status = ChallengeStatus.PUBLISHED;
    }

    const categories = this.parseNameList(query.category);
    if (categories) {
      where.category = {
        is: {
          OR: categories.map((name) => ({
            name: { equals: name, mode: 'insensitive' as const },
          })),
        },
      };
    }

    const difficulties = this.parseEnumList(
      query.difficulty,
      Object.values(ChallengeDifficulty),
    );
    if (difficulties) {
      where.difficulty = { in: difficulties };
    }

    const challengeTypes = this.parseEnumList(
      query.challengeType,
      Object.values(ChallengeType),
    );
    if (challengeTypes) {
      where.challengeType = { in: challengeTypes };
    }

    if (query.companyId) {
      where.companyId = query.companyId;
    }

    if (query.search) {
      and.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { summary: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          // Posisi yang direkrut adalah kata yang paling mungkin diketik
          // kandidat — "Video Editor" tidak selalu muncul di judul, dan enam
          // kategori tidak punya keranjang untuknya.
          { role: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    if (and.length > 0) {
      where.AND = and;
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 24));
    const sortDirection: Prisma.SortOrder =
      query.sort === 'TERLAMA' ? 'asc' : 'desc';

    const [data, total] = await this.prisma.$transaction([
      this.prisma.challenge.findMany({
        where,
        // Daftar sengaja tidak memuat description, gradingRubric,
        // briefAttachments, dan aiPromptUsed: kolom-kolom itu berat dan hanya
        // dibutuhkan di halaman detail.
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          role: true,
          category: CHALLENGE_CATEGORY_SELECT,
          difficulty: true,
          challengeType: true,
          status: true,
          isPrivate: true,
          rewardDescription: true,
          startsAt: true,
          deadlineAt: true,
          createdAt: true,
          createdByAi: true,
          company: {
            select: {
              companyName: true,
              logoUrl: true,
              industry: true,
              trustScore: true,
            },
          },
          creator: {
            select: { fullName: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: sortDirection },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.challenge.count({ where }),
    ]);

    return { data: flattenCategories(data), total, page, limit };
  }

  /**
   * Benar bila pemanggil berhak melihat isi soal tanpa redaksi: admin, atau
   * pemilik challenge tersebut — perusahaan lewat `companyId`, talenta lewat
   * `talentId` untuk Public Challenge.
   */
  private isChallengeOwner(
    userReq: { role?: string; profileId?: string } | undefined,
    challenge: { companyId: string | null; talentId: string | null },
  ): boolean {
    if (!userReq) return false;
    if (userReq.role === Role.ADMIN) return true;
    if (!userReq.profileId) return false;

    if (userReq.role === Role.COMPANY) {
      return userReq.profileId === challenge.companyId;
    }
    if (userReq.role === Role.TALENT) {
      return userReq.profileId === challenge.talentId;
    }
    return false;
  }

  async findOne(slugOrId: string, userReq?: any) {
    const challenge = await this.prisma.challenge.findFirst({
      where: {
        OR: [{ id: slugOrId }, { slug: slugOrId }],
      },
      include: {
        company: true,
        category: CHALLENGE_CATEGORY_SELECT,
        components: {
          orderBy: { order: 'asc' },
        },
        sections: {
          include: {
            components: {
              orderBy: { order: 'asc' },
            },
          },
          orderBy: { order: 'asc' },
        },
        discussions: {
          include: { user: { select: DISCUSSION_AUTHOR_SELECT } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!challenge) {
      throw new NotFoundException('Challenge tidak ditemukan');
    }

    // Pembuat challenge harus melihat soalnya utuh. Sebelumnya hanya peran
    // COMPANY yang diakui, sehingga pembuat TALENT dan ADMIN menerima versi
    // teredaksi — dan karena halaman edit memuat lalu menyimpan ulang isi yang
    // sama, teks "[TERKUNCI - HARAP DAFTAR]" tertulis permanen menimpa soal
    // aslinya.
    const isOwner = this.isChallengeOwner(userReq, challenge);

    if (!isOwner) {
      const redactComponent = (comp: any) => ({
        ...comp,
        question: '[TERKUNCI - HARAP DAFTAR]',
        options: null,
        metadata: null,
        points: comp.points,
      });

      if (challenge.components) {
        challenge.components = challenge.components.map(redactComponent) as any;
      }
      if (challenge.sections) {
        challenge.sections = challenge.sections.map((sec) => ({
          ...sec,
          components: sec.components.map(redactComponent),
        }));
      }
    }

    return flattenCategory(challenge);
  }

  async generateAiBlueprint(companyId: string, dto: GenerateAiBlueprintDto) {
    const company = await this.prisma.companyProfile.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Profil Perusahaan tidak ditemukan');
    }

    if (
      subscriptionLimitsEnforced() &&
      company.subscriptionTier === 'STARTUP'
    ) {
      throw new ForbiddenException(
        'Fitur AI Generator dikunci pada Paket Murah. Silakan tingkatkan langganan Anda.',
      );
    }

    const activeCount = await this.prisma.challenge.count({
      where: {
        companyId,
        status: { in: [ChallengeStatus.DRAFT, ChallengeStatus.PUBLISHED] },
      },
    });

    if (
      subscriptionLimitsEnforced() &&
      company.subscriptionTier === 'KONGLOMERAT' &&
      activeCount >= 5
    ) {
      throw new ForbiddenException(
        'Paket Pro hanya mengizinkan 5 studi kasus aktif/draf. Silakan tingkatkan langganan Anda.',
      );
    }

    const blueprint = await this.aiService.generateChallengeBlueprint(
      dto.prompt,
      dto.category ?? 'Lintas bidang',
      dto.difficulty,
      company.companyName,
      dto.previousBlueprint,
    );

    return blueprint;
  }

  async generateAiPublicBlueprint(userId: string, dto: GenerateAiBlueprintDto) {
    const talent = await this.prisma.talentProfile.findUnique({
      where: { userId },
    });

    if (!talent) {
      throw new NotFoundException('Profil Talenta tidak ditemukan');
    }

    const blueprint = await this.aiService.generateChallengeBlueprint(
      dto.prompt,
      dto.category ?? 'Lintas bidang',
      dto.difficulty,
      'Komunitas / Public',
      dto.previousBlueprint,
    );

    return blueprint;
  }

  private async processAiChallengeBackground(
    challengeId: string,
    userId: string,
    dto: GenerateAiChallengeDto,
    // Diisi hanya untuk Public Challenge milik talenta, yang pembuatannya
    // berbayar. Kegagalan di sini terjadi setelah permintaan HTTP selesai,
    // jadi tidak ada transaksi yang bisa membatalkan pemotongan token —
    // pengembaliannya harus dilakukan secara eksplisit.
    refundOnFailure?: { amount: number; reason: string },
  ) {
    try {
      const aiContent = await this.aiService.generateChallengeContent(
        dto.blueprint,
        dto.difficulty,
      );
      const slug = await this.generateUniqueSlug(aiContent.title);

      await this.prisma.challenge.update({
        where: { id: challengeId },
        data: {
          title: aiContent.title,
          slug,
          summary: aiContent.summary,
          description: aiContent.description,
          gradingRubric: aiContent.rubric,
          startsAt: aiContent.startsAt ? new Date(aiContent.startsAt) : null,
          deadlineAt: aiContent.deadlineAt
            ? new Date(aiContent.deadlineAt)
            : null,
          sections:
            aiContent.sections && aiContent.sections.length > 0
              ? {
                  create: aiContent.sections.map((s: any, sIdx: number) => ({
                    title: s.title,
                    description: s.description,
                    order: sIdx,
                    components:
                      s.components && s.components.length > 0
                        ? {
                            create: s.components.map((c: any, cIdx: number) => {
                              let mappedType =
                                c.type === 'TEXT' ? 'ESSAY' : c.type || 'ESSAY';
                              if (mappedType === 'VIDEO_RECORDING')
                                mappedType = 'VIDEO_UPLOAD';
                              if (mappedType === 'URL_LINK')
                                mappedType = 'URL_SUBMISSION';

                              return {
                                challengeId: challengeId,
                                type: mappedType,
                                question: c.question,
                                points: c.points ?? 10,
                                order: cIdx,
                                options: c.options || undefined,
                                metadata:
                                  c.language || c.starterCode
                                    ? {
                                        language: c.language,
                                        starterCode: c.starterCode,
                                      }
                                    : undefined,
                              };
                            }),
                          }
                        : undefined,
                  })),
                }
              : undefined,
        },
      });

      const challenge = await this.prisma.challenge.findUnique({
        where: { id: challengeId },
      });

      await this.prisma.notification.create({
        data: {
          userId,
          title: 'Draft AI Selesai',
          content: `Sistem AI telah selesai membuat draf studi kasus "${challenge?.title || aiContent.title}". Silakan periksa dan terbitkan.`,
          linkUrl: `/challenges/${challengeId}/edit`,
        },
      });
    } catch (error) {
      this.logger.error(
        `Generasi AI di latar belakang gagal untuk challenge ${challengeId}`,
        error instanceof Error ? error.stack : String(error),
      );

      let refunded = false;
      if (refundOnFailure) {
        try {
          await this.tokensService.earnTokens(
            userId,
            refundOnFailure.amount,
            refundOnFailure.reason,
          );
          refunded = true;
        } catch (refundError) {
          this.logger.error(
            `Pengembalian ${refundOnFailure.amount} token untuk ${userId} gagal`,
            refundError instanceof Error
              ? refundError.stack
              : String(refundError),
          );
        }
      }

      await this.prisma.notification.create({
        data: {
          userId,
          title: 'Draft AI Gagal',
          content: refunded
            ? `Maaf, sistem AI gagal menyelesaikan draf studi kasus Anda. ${refundOnFailure!.amount} Token telah dikembalikan ke saldo Anda. Kerangka draf tetap tersimpan dan bisa Anda lanjutkan secara manual.`
            : `Maaf, sistem AI gagal menyelesaikan draf studi kasus Anda. Kerangka draf tetap tersimpan dan bisa Anda lanjutkan secara manual.`,
          linkUrl: `/challenges/${challengeId}/edit`,
        },
      });
    }
  }

  async generateAiChallenge(companyId: string, dto: GenerateAiChallengeDto) {
    const title = dto.blueprint.title || 'Draft AI Challenge';
    const categoryId = await this.skillsService.resolveCategoryId(dto.category);

    const { challenge: newChallenge, companyUserId } = await this.withSlugRetry(
      title,
      (slug) =>
        this.prisma.$transaction(
          async (tx) => {
            const company = await this.lockCompany(tx, companyId);

            // Diperiksa sebelum kuota supaya paket Murah menerima pesan
            // "fitur AI dikunci", bukan pesan kuota yang menyesatkan.
            if (
              subscriptionLimitsEnforced() &&
              company.subscriptionTier === 'STARTUP'
            ) {
              throw new ForbiddenException(
                'Fitur AI Generator dikunci pada Paket Murah. Silakan tingkatkan langganan Anda.',
              );
            }

            await this.assertCompanyQuota(tx, company);

            const challengeId = crypto.randomUUID();

            const challenge = await tx.challenge.create({
              data: {
                id: challengeId,
                companyId,
                title,
                slug,
                summary:
                  dto.blueprint.summary ||
                  'Proses pembuatan sedang berjalan di latar belakang...',
                description:
                  dto.blueprint.description ||
                  'Mohon tunggu, AI sedang menyusun soal...',
                role: dto.role ?? null,
                categoryId,
                difficulty: dto.difficulty,
                gradingRubric: dto.blueprint.rubric || {},
                status: ChallengeStatus.DRAFT,
                createdByAi: true,
                aiPromptUsed: dto.prompt,
                challengeType: ChallengeType.COMPANY,
              },
            });

            return { challenge, companyUserId: company.userId };
          },
          { timeout: ChallengesService.TX_TIMEOUT_MS },
        ),
    );

    // Run in background without await
    this.processAiChallengeBackground(
      newChallenge.id,
      companyUserId,
      dto,
    ).catch((e) => this.logger.error(e));

    return newChallenge;
  }

  async generateAiPublicChallenge(userId: string, dto: GenerateAiChallengeDto) {
    const title = dto.blueprint.title || 'Draft AI Public Challenge';
    const categoryId = await this.skillsService.resolveCategoryId(dto.category);

    // Sama seperti createPublic: pemotongan token menyatu dengan pembuatan
    // draf, jadi permintaan yang gagal tidak menyisakan saldo terpotong.
    const { challenge: newChallenge, talentUserId } = await this.withSlugRetry(
      title,
      (slug) =>
        this.prisma.$transaction(
          async (tx) => {
            const talent = await this.lockTalentAndAssertQuota(tx, userId);

            await this.tokensService.spendTokensWithin(
              tx,
              userId,
              ChallengesService.PUBLIC_CHALLENGE_COST,
              `AI Generate Public Challenge: ${dto.category ?? title}`,
            );

            const challengeId = crypto.randomUUID();

            const challenge = await tx.challenge.create({
              data: {
                id: challengeId,
                talentId: talent.id,
                title,
                slug,
                summary:
                  dto.blueprint.summary ||
                  'Proses pembuatan sedang berjalan di latar belakang...',
                description:
                  dto.blueprint.description ||
                  'Mohon tunggu, AI sedang menyusun soal...',
                role: dto.role ?? null,
                categoryId,
                difficulty: dto.difficulty,
                gradingRubric: dto.blueprint.rubric || {},
                status: ChallengeStatus.DRAFT,
                createdByAi: true,
                aiPromptUsed: dto.prompt,
                challengeType: ChallengeType.PUBLIC,
              },
            });

            return { challenge, talentUserId: talent.userId };
          },
          { timeout: ChallengesService.TX_TIMEOUT_MS },
        ),
    );

    // Run in background without await
    this.processAiChallengeBackground(newChallenge.id, talentUserId, dto, {
      amount: ChallengesService.PUBLIC_CHALLENGE_COST,
      reason: `Pengembalian: generasi AI untuk "${title}" gagal`,
    }).catch((e) => this.logger.error(e));

    return newChallenge;
  }

  async updateChallenge(
    id: string,
    profileId: string,
    updateDto: UpdateChallengeDto,
    userId?: string,
    role?: string,
  ) {
    // Admin memoderasi milik siapa pun, jadi penyaring kepemilikan dilewati
    // secara eksplisit. Sebelumnya hal ini terjadi tanpa sengaja: profileId
    // admin bernilai undefined, sehingga `OR` berisi dua objek kosong dan
    // cocok dengan challenge mana pun.
    const isAdmin = role === Role.ADMIN;

    if (!isAdmin && !profileId) {
      throw new ForbiddenException(
        'Sesi tidak memiliki profil. Silakan masuk ulang.',
      );
    }

    // `undefined` berarti permintaan tidak menyentuh bidang sama sekali dan
    // nilai lama harus bertahan; string kosong berarti pengubahnya sengaja
    // melepas bidangnya menjadi lintas bidang.
    const categoryId =
      updateDto.category === undefined
        ? undefined
        : await this.skillsService.resolveCategoryId(updateDto.category);

    // Pembacaan status dan penulisannya berada dalam satu transaksi: tanpa
    // itu dua penyimpanan bersamaan bisa sama-sama melihat status DRAFT dan
    // sama-sama menulis, membuat set section tertimpa dua kali.
    const { challenge, updated } = await this.retryOnSlugConflict(() =>
      this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.challenge.findFirst({
            where: isAdmin
              ? { id }
              : {
                  id,
                  OR: [{ companyId: profileId }, { talentId: profileId }],
                },
            // Section ikut dibaca supaya pemeriksaan penerbitan punya bahan
            // ketika permintaan hanya mengubah status tanpa mengirim ulang
            // seluruh soal.
            include: {
              sections: {
                select: {
                  // Id dibaca supaya penulisan ulang bisa mempertahankan
                  // section yang sudah ada, dan supaya id kiriman klien bisa
                  // diperiksa memang milik challenge ini.
                  id: true,
                  // Kolom gerbang ikut dibaca supaya `PATCH { status:
                  // 'PUBLISHED' }` polos — yang tidak mengirim ulang sections —
                  // tetap diperiksa terhadap pengaturan yang sudah tersimpan.
                  title: true,
                  order: true,
                  opensAt: true,
                  closesAt: true,
                  gateMode: true,
                  minScore: true,
                  maxAdvancing: true,
                  scoreBasis: true,
                  gateSourceIds: true,
                  pendingPolicy: true,
                  graceDays: true,
                  components: {
                    // `metadata` ikut dibaca karena pemeriksaan soal psikotes
                    // membacanya; tanpa itu penerbitan lewat PATCH tanpa
                    // sections akan menganggap skalanya belum diisi.
                    select: {
                      type: true,
                      question: true,
                      options: true,
                      metadata: true,
                    },
                  },
                },
              },
            },
          });

          if (!existing) {
            throw new NotFoundException('Challenge tidak ditemukan');
          }

          if (existing.status === ChallengeStatus.PUBLISHED) {
            throw new ForbiddenException(
              'Studi kasus yang sudah diterbitkan tidak dapat diedit. Silakan buat yang baru.',
            );
          }

          if (existing.status === ChallengeStatus.CLOSED) {
            throw new ForbiddenException(
              'Studi kasus yang sudah diarsipkan tidak dapat diubah.',
            );
          }

          this.assertChallengeConsistency(updateDto, existing);

          // Slug ikut disegarkan bila judul draf berubah. Tanpa ini tautan
          // publik selamanya memakai judul lama — draf hasil AI, misalnya,
          // terbit dengan slug "draft-ai-challenge".
          const isRenamed =
            !!updateDto.title && updateDto.title !== existing.title;

          const result = await tx.challenge.update({
            where: { id },
            data: {
              slug: isRenamed
                ? await this.generateUniqueSlug(updateDto.title!, tx)
                : undefined,
              title: updateDto.title,
              summary: updateDto.summary,
              description: updateDto.description,
              role: updateDto.role,
              categoryId,
              difficulty: updateDto.difficulty,
              datasetUrl: updateDto.datasetUrl,
              mockApiUrl: updateDto.mockApiUrl,
              brandGuidelineUrl: updateDto.brandGuidelineUrl,
              gradingRubric:
                updateDto.gradingRubric !== undefined
                  ? updateDto.gradingRubric
                  : undefined,
              proctoringSettings:
                updateDto.proctoringSettings !== undefined
                  ? updateDto.proctoringSettings
                  : undefined,
              rewardDescription: updateDto.difficulty
                ? this.generateSystemRewardDescription(updateDto.difficulty)
                : undefined,
              startsAt: updateDto.startsAt
                ? new Date(updateDto.startsAt)
                : undefined,
              // Keduanya dulu tidak ikut disalin, jadi batas akhir yang diisi di
              // formulir hilang tanpa jejak begitu draf disimpan ulang.
              deadlineAt: updateDto.deadlineAt
                ? new Date(updateDto.deadlineAt)
                : undefined,
              isPrivate: updateDto.isPrivate,
              status: updateDto.status,
            },
          });

          // Section ditulis di luar `challenge.update` supaya urutan hapus dan
          // buat bisa dipastikan; lihat `writeSections`.
          //
          // Syaratnya `!== undefined`, bukan "ada isinya". Dengan syarat lama,
          // menghapus seluruh tahap lalu menyimpan tidak mengubah apa pun:
          // antarmuka melaporkan sukses sementara section lama tetap utuh di
          // basis data.
          if (updateDto.sections !== undefined) {
            await this.writeSections(
              tx,
              id,
              updateDto.sections,
              new Set(existing.sections.map((s) => s.id)),
            );
          }

          // Sebagian besar penerbitan lewat sini: builder menyimpan draf
          // berkali-kali, lalu menerbitkannya dengan PATCH.
          if (
            existing.status === ChallengeStatus.DRAFT &&
            result.status === ChallengeStatus.PUBLISHED &&
            existing.companyId &&
            updateDto.saveQuestionsToBank !== false
          ) {
            await this.absorbSelfWrittenQuestions(tx, id, existing.companyId);
          }

          // Penerbitan lewat PATCH dulu tidak memberi kabar apa pun, padahal
          // jalur AI selalu berakhir di sini: draf dibuat mesin, lalu manusia
          // menerbitkannya.
          if (
            existing.status === ChallengeStatus.DRAFT &&
            result.status === ChallengeStatus.PUBLISHED
          ) {
            const ownerUserId = await this.resolveOwnerUserId(tx, existing);

            if (ownerUserId) {
              await tx.notification.create({
                data: {
                  userId: ownerUserId,
                  title: 'Studi Kasus Diterbitkan',
                  content: `Studi Kasus "${result.title}" berhasil diterbitkan.`,
                  linkUrl: `/challenges/${result.slug}`,
                },
              });
            }
          }

          // Id tahap ikut dikembalikan supaya builder menyimpannya dan
          // penyimpanan berikutnya memperbarui baris yang sama. Dibaca ulang
          // di sini, bukan diambil dari `result`, karena section ditulis
          // sesudah `challenge.update` berjalan.
          const sections = await tx.challengeSection.findMany({
            where: { challengeId: id },
            select: { id: true, order: true },
            orderBy: { order: 'asc' },
          });

          return { challenge: existing, updated: { ...result, sections } };
        },
        { timeout: ChallengesService.TX_TIMEOUT_MS },
      ),
    );

    // Syarat peran dilepas: moderasi oleh ADMIN juga menyentuh studi kasus
    // milik perusahaan dan sama-sama perlu tercatat. Public Challenge milik
    // talenta tidak punya perusahaan, jadi tidak ada barisnya untuk ditulis.
    if (userId && challenge.companyId) {
      const changedKeys = Object.keys(updateDto);
      await this.companiesService.logAction(
        challenge.companyId,
        userId,
        'UPDATE_CHALLENGE',
        'CHALLENGE',
        challenge.id,
        { changedFields: changedKeys, actorRole: role },
      );
    }

    return updated;
  }

  /**
   * Mengubah jadwal dan syarat masuk satu tahap, termasuk pada studi kasus yang
   * sudah terbit.
   *
   * Jalur tersendiri, bukan bagian dari `updateChallenge`, karena keduanya punya
   * aturan yang berlawanan: menyunting soal hanya boleh saat DRAFT — jawaban
   * kandidat menunjuk baris soal, jadi mengubahnya di tengah pengerjaan
   * menggantungkan jawaban pada pertanyaan yang berbeda dari yang dijawab.
   * Ambang lolos dan jadwal justru paling perlu diubah setelah terbit: barulah
   * terlihat bahwa "minimal 80" menyisakan nol kandidat.
   *
   * Batas waktu yang sedang berjalan tidak ikut berubah. `timeLimit` baru hanya
   * berlaku bagi kandidat yang belum menekan "Mulai" — memundurkan
   * `StageAttempt.expiresAt` yang sudah tercap berarti memotong waktu orang di
   * tengah pengerjaan.
   */
  async updateStageGate(
    challengeId: string,
    sectionId: string,
    profileId: string,
    dto: UpdateStageGateDto,
    userId?: string,
    role?: string,
  ) {
    const isAdmin = role === Role.ADMIN;

    if (!isAdmin && !profileId) {
      throw new ForbiddenException(
        'Sesi tidak memiliki profil. Silakan masuk ulang.',
      );
    }

    const challenge = await this.prisma.challenge.findFirst({
      where: isAdmin
        ? { id: challengeId }
        : {
            id: challengeId,
            OR: [{ companyId: profileId }, { talentId: profileId }],
          },
      include: {
        sections: {
          orderBy: { order: 'asc' },
          // `question` ikut dibaca hanya karena bentuk `ValidatableComponent`
          // menuntutnya; pemeriksaan gerbang sendiri cuma melihat `type`.
          include: { components: { select: { type: true, question: true } } },
        },
      },
    });

    if (!challenge) throw new NotFoundException('Challenge tidak ditemukan');

    if (challenge.status === ChallengeStatus.CLOSED) {
      throw new ForbiddenException(
        'Studi kasus yang sudah diarsipkan tidak dapat diubah.',
      );
    }

    const target = challenge.sections.find((s) => s.id === sectionId);
    if (!target) throw new NotFoundException('Tahap tidak ditemukan');

    // Pemeriksaan dijalankan atas keadaan setelah perubahan, bukan atas satu
    // tahap terpisah: syarat masuk selalu menunjuk tahap lain, jadi sahnya satu
    // tahap hanya bisa dinilai bersama tetangganya.
    const projected = challenge.sections.map((section) =>
      section.id === sectionId
        ? {
            ...section,
            timeLimit: dto.timeLimit ?? section.timeLimit,
            opensAt:
              dto.opensAt !== undefined
                ? dto.opensAt
                  ? new Date(dto.opensAt)
                  : null
                : section.opensAt,
            closesAt:
              dto.closesAt !== undefined
                ? dto.closesAt
                  ? new Date(dto.closesAt)
                  : null
                : section.closesAt,
            gateMode: dto.gateMode ?? section.gateMode,
            minScore:
              dto.minScore !== undefined ? dto.minScore : section.minScore,
            maxAdvancing:
              dto.maxAdvancing !== undefined
                ? dto.maxAdvancing
                : section.maxAdvancing,
            scoreBasis: dto.scoreBasis ?? section.scoreBasis,
            gateSourceIds: dto.gateSourceIds ?? section.gateSourceIds,
            pendingPolicy: dto.pendingPolicy ?? section.pendingPolicy,
            graceDays:
              dto.graceDays !== undefined ? dto.graceDays : section.graceDays,
          }
        : section,
    );

    this.assertStageGatesConsistent(
      projected,
      challenge.startsAt,
      challenge.deadlineAt,
    );

    const updated = await this.prisma.challengeSection.update({
      where: { id: sectionId },
      data: {
        timeLimit: dto.timeLimit,
        opensAt:
          dto.opensAt !== undefined
            ? dto.opensAt
              ? new Date(dto.opensAt)
              : null
            : undefined,
        closesAt:
          dto.closesAt !== undefined
            ? dto.closesAt
              ? new Date(dto.closesAt)
              : null
            : undefined,
        gateMode: dto.gateMode,
        minScore: dto.minScore,
        maxAdvancing: dto.maxAdvancing,
        scoreBasis: dto.scoreBasis,
        gateSourceIds: dto.gateSourceIds,
        pendingPolicy: dto.pendingPolicy,
        graceDays: dto.graceDays,
      },
    });

    if (userId && challenge.companyId) {
      await this.companiesService.logAction(
        challenge.companyId,
        userId,
        'UPDATE_STAGE_GATE',
        'CHALLENGE',
        challengeId,
        { sectionId, changedFields: Object.keys(dto), actorRole: role },
      );
    }

    return updated;
  }

  /**
   * Menutup studi kasus.
   *
   * Status CLOSED tidak ikut dihitung `assertCompanyQuota`, jadi ini satu-
   * satunya cara pemilik membebaskan slot paketnya sendiri: studi kasus yang
   * sudah terbit tidak bisa disunting maupun dihapus siapa pun selain admin.
   */
  async archiveChallenge(
    id: string,
    profileId: string,
    userId?: string,
    role?: string,
  ) {
    const isAdmin = role === Role.ADMIN;

    if (!isAdmin && !profileId) {
      throw new ForbiddenException(
        'Sesi tidak memiliki profil. Silakan masuk ulang.',
      );
    }

    const existing = await this.prisma.challenge.findFirst({
      where: isAdmin
        ? { id }
        : {
            id,
            OR: [{ companyId: profileId }, { talentId: profileId }],
          },
    });

    if (!existing) {
      throw new NotFoundException('Challenge tidak ditemukan');
    }

    if (existing.status === ChallengeStatus.CLOSED) {
      throw new BadRequestException('Studi kasus ini sudah diarsipkan.');
    }

    const updated = await this.prisma.challenge.update({
      where: { id },
      data: { status: ChallengeStatus.CLOSED },
    });

    if (userId && existing.companyId) {
      await this.companiesService.logAction(
        existing.companyId,
        userId,
        'ARCHIVE_CHALLENGE',
        'CHALLENGE',
        existing.id,
        { previousStatus: existing.status, actorRole: role },
      );
    }

    return updated;
  }

  /** Akun pemilik studi kasus, baik lewat perusahaan maupun talenta. */
  private async resolveOwnerUserId(
    tx: Prisma.TransactionClient,
    challenge: { companyId: string | null; talentId: string | null },
  ): Promise<string | null> {
    if (challenge.companyId) {
      const company = await tx.companyProfile.findUnique({
        where: { id: challenge.companyId },
        select: { userId: true },
      });
      return company?.userId ?? null;
    }

    if (challenge.talentId) {
      const talent = await tx.talentProfile.findUnique({
        where: { id: challenge.talentId },
        select: { userId: true },
      });
      return talent?.userId ?? null;
    }

    return null;
  }

  private generateSlug(title: string): string {
    const baseSlug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 80) || 'challenge';
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    return `${baseSlug}-${randomSuffix}`;
  }

  /**
   * Kolom `slug` bersifat unique. Sufiks acak saja tidak cukup: tanpa
   * pemeriksaan, judul yang sama berpeluang bentrok dan Prisma melempar P2002
   * yang muncul ke pengguna sebagai galat 500. Kandidat karena itu diperiksa
   * lebih dulu, dan sisa peluang balapan ditangani `withSlugRetry`.
   */
  private async generateUniqueSlug(
    title: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<string> {
    for (let i = 0; i < ChallengesService.SLUG_ATTEMPTS; i++) {
      const candidate = this.generateSlug(title);
      const taken = await client.challenge.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    return `${this.generateSlug(title)}-${crypto.randomUUID()}`;
  }

  private isSlugConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      String((error.meta as { target?: string[] })?.target ?? '').includes(
        'slug',
      )
    );
  }

  /**
   * Menjalankan operasi tulis dengan slug segar, mengulang bila dua permintaan
   * bersamaan sempat memilih slug yang sama.
   */
  private async withSlugRetry<T>(
    title: string,
    operation: (slug: string) => Promise<T>,
  ): Promise<T> {
    for (let i = 0; i < ChallengesService.SLUG_ATTEMPTS; i++) {
      const slug = await this.generateUniqueSlug(title);
      try {
        return await operation(slug);
      } catch (error) {
        if (!this.isSlugConflict(error)) throw error;
        this.logger.warn(
          `Slug "${slug}" bentrok saat penulisan, mencoba ulang.`,
        );
      }
    }
    throw new ConflictException(
      'Gagal membuat tautan unik untuk studi kasus ini. Silakan coba lagi.',
    );
  }

  /**
   * Sama seperti `withSlugRetry`, tetapi untuk operasi yang memilih slugnya
   * sendiri di tengah jalan — pembaruan baru tahu perlu slug baru setelah
   * membaca judul lama di dalam transaksi.
   */
  private async retryOnSlugConflict<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    for (let i = 0; i < ChallengesService.SLUG_ATTEMPTS; i++) {
      try {
        return await operation();
      } catch (error) {
        if (!this.isSlugConflict(error)) throw error;
        this.logger.warn('Slug bentrok saat pembaruan, mencoba ulang.');
      }
    }

    throw new ConflictException(
      'Gagal membuat tautan unik untuk studi kasus ini. Silakan coba lagi.',
    );
  }

  private generateSystemRewardDescription(
    difficulty: ChallengeDifficulty,
  ): string {
    let maxToken = 10;
    let maxXP = 100;

    if (difficulty === ChallengeDifficulty.INTERMEDIATE) {
      maxToken = 30;
      maxXP = 200;
    } else if (difficulty === ChallengeDifficulty.ADVANCED) {
      maxToken = 75;
      maxXP = 400;
    }

    // Hitung bonus perfect score untuk token (max token + 50%)
    const perfectToken = maxToken + Math.floor(maxToken * 0.5);

    return `Sistem Reward: Hingga ${perfectToken} Token & ${maxXP} XP`;
  }
}
