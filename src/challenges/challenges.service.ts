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
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { UpdateChallengeDto } from './dto/update-challenge.dto';
import { GenerateAiChallengeDto } from './dto/generate-ai-challenge.dto';
import { GenerateAiBlueprintDto } from './dto/generate-ai-blueprint.dto';
import { ChallengeSectionDto } from './dto/create-challenge.dto';
import {
  ChallengeCategory,
  ChallengeDifficulty,
  ChallengeStatus,
  ChallengeType,
  Prisma,
  Role,
  SectionStageType,
} from '@prisma/client';
import crypto from 'crypto';

@Injectable()
export class ChallengesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly tokensService: TokensService,
    private readonly notificationsService: NotificationsService,
    private readonly companiesService: CompaniesService,
  ) {}

  private readonly logger = new Logger(ChallengesService.name);

  /** Biaya token untuk satu Public Challenge yang dibuat talenta. */
  private static readonly PUBLIC_CHALLENGE_COST = 50;

  /** Batas percobaan mencari slug yang belum terpakai. */
  private static readonly SLUG_ATTEMPTS = 5;

  /**
   * Transaksi pembuatan challenge menulis satu challenge beserta seluruh
   * section dan komponennya, jadi batas bawaan Prisma (5 detik) terlalu ketat
   * untuk soal yang panjang.
   */
  private static readonly TX_TIMEOUT_MS = 20000;

  /**
   * Bentuk nested-create untuk section beserta komponennya. Dipakai bersama
   * oleh create, createPublic, dan updateChallenge supaya kolom baru tidak
   * terlewat di salah satu jalur.
   */
  private buildSectionsCreateInput(
    challengeId: string,
    sections?: ChallengeSectionDto[],
  ) {
    if (!sections || sections.length === 0) return undefined;

    return {
      create: sections.map((s, sIdx) => ({
        title: s.title,
        description: s.description,
        order: s.order ?? sIdx,
        stageType: s.stageType ?? SectionStageType.ASSIGNMENT,
        timeLimit: s.timeLimit ?? null,
        components:
          s.components && s.components.length > 0
            ? {
                create: s.components.map((c, cIdx) => ({
                  challengeId,
                  type: c.type,
                  question: c.question,
                  description: c.description,
                  options: c.options ?? undefined,
                  metadata: c.metadata ?? undefined,
                  points: c.points ?? 10,
                  order: c.order ?? cIdx,
                })),
              }
            : undefined,
      })),
    };
  }

  private static readonly DEFAULT_RUBRIC = {
    completeness: 30,
    quality: 40,
    efficiency: 30,
  };

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
                category: createChallengeDto.category,
                difficulty: createChallengeDto.difficulty,
                datasetUrl: createChallengeDto.datasetUrl,
                mockApiUrl: createChallengeDto.mockApiUrl,
                brandGuidelineUrl: createChallengeDto.brandGuidelineUrl,
                gradingRubric:
                  createChallengeDto.gradingRubric ??
                  ChallengesService.DEFAULT_RUBRIC,
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
            });

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
    // Pemotongan token dan pembuatan challenge berada dalam satu transaksi.
    // Sebelumnya token dipotong lebih dulu di transaksinya sendiri, sehingga
    // profil talenta yang tidak ditemukan atau kegagalan penulisan apa pun
    // meninggalkan saldo terpotong tanpa challenge dan tanpa pengembalian.
    return this.withSlugRetry(createChallengeDto.title, (slug) =>
      this.prisma.$transaction(
        async (tx) => {
          const talentProfile = await tx.talentProfile.findUnique({
            where: { userId },
          });

          if (!talentProfile) {
            throw new NotFoundException('Profil Talenta tidak ditemukan');
          }

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
              category: createChallengeDto.category,
              difficulty: createChallengeDto.difficulty,
              datasetUrl: createChallengeDto.datasetUrl,
              mockApiUrl: createChallengeDto.mockApiUrl,
              brandGuidelineUrl: createChallengeDto.brandGuidelineUrl,
              gradingRubric:
                createChallengeDto.gradingRubric ??
                ChallengesService.DEFAULT_RUBRIC,
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

  async findAll(
    query: {
      category?: string;
      difficulty?: string;
      challengeType?: string;
      search?: string;
      companyId?: string;
      includeDrafts?: string;
      sort?: string;
      page?: number;
      limit?: number;
    },
    requester?: { sub?: string; role?: Role; profileId?: string },
  ) {
    // Hanya pemilik perusahaan yang bersangkutan (atau admin) yang boleh melihat
    // challenge privat dan draft. Tanpa pemeriksaan ini, siapa pun cukup
    // menebak/menyalin companyId untuk membaca soal yang belum terbit.
    const isAdmin = requester?.role === Role.ADMIN;
    const isOwner =
      !!query.companyId &&
      !!requester?.profileId &&
      requester.profileId === query.companyId;
    const canSeeRestricted = isAdmin || isOwner;

    const where: Prisma.ChallengeWhereInput = {};

    if (!canSeeRestricted) {
      where.isPrivate = false;
    }

    if (query.includeDrafts === 'true' && canSeeRestricted) {
      where.status = { in: [ChallengeStatus.PUBLISHED, ChallengeStatus.DRAFT] };
    } else {
      where.status = ChallengeStatus.PUBLISHED;
    }

    const categories = this.parseEnumList(
      query.category,
      Object.values(ChallengeCategory),
    );
    if (categories) {
      where.category = { in: categories };
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
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { summary: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
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
          category: true,
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

    return { data, total, page, limit };
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
          include: { user: { select: { email: true, role: true } } },
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

    return challenge;
  }

  async generateAiBlueprint(companyId: string, dto: GenerateAiBlueprintDto) {
    const company = await this.prisma.companyProfile.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Profil Perusahaan tidak ditemukan');
    }

    if (company.subscriptionTier === 'STARTUP') {
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

    if (company.subscriptionTier === 'KONGLOMERAT' && activeCount >= 5) {
      throw new ForbiddenException(
        'Paket Pro hanya mengizinkan 5 studi kasus aktif/draf. Silakan tingkatkan langganan Anda.',
      );
    }

    const blueprint = await this.aiService.generateChallengeBlueprint(
      dto.prompt,
      dto.category,
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
      dto.category,
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

    const { challenge: newChallenge, companyUserId } = await this.withSlugRetry(
      title,
      (slug) =>
        this.prisma.$transaction(
          async (tx) => {
            const company = await this.lockCompany(tx, companyId);

            // Diperiksa sebelum kuota supaya paket Murah menerima pesan
            // "fitur AI dikunci", bukan pesan kuota yang menyesatkan.
            if (company.subscriptionTier === 'STARTUP') {
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
                category: dto.category,
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

    // Sama seperti createPublic: pemotongan token menyatu dengan pembuatan
    // draf, jadi permintaan yang gagal tidak menyisakan saldo terpotong.
    const { challenge: newChallenge, talentUserId } = await this.withSlugRetry(
      title,
      (slug) =>
        this.prisma.$transaction(
          async (tx) => {
            const talent = await tx.talentProfile.findUnique({
              where: { userId },
            });

            if (!talent) {
              throw new NotFoundException('Profil Talenta tidak ditemukan');
            }

            await this.tokensService.spendTokensWithin(
              tx,
              userId,
              ChallengesService.PUBLIC_CHALLENGE_COST,
              `AI Generate Public Challenge: ${dto.category}`,
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
                category: dto.category,
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
    // Pembacaan status dan penulisannya berada dalam satu transaksi: tanpa
    // itu dua penyimpanan bersamaan bisa sama-sama melihat status DRAFT dan
    // sama-sama menulis, membuat set section tertimpa dua kali.
    const { challenge, updated } = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.challenge.findFirst({
          where: {
            id,
            OR: [{ companyId: profileId }, { talentId: profileId }],
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

        const result = await tx.challenge.update({
          where: { id },
          data: {
            title: updateDto.title,
            summary: updateDto.summary,
            description: updateDto.description,
            category: updateDto.category,
            difficulty: updateDto.difficulty,
            datasetUrl: updateDto.datasetUrl,
            mockApiUrl: updateDto.mockApiUrl,
            brandGuidelineUrl: updateDto.brandGuidelineUrl,
            gradingRubric:
              updateDto.gradingRubric !== undefined
                ? updateDto.gradingRubric
                : undefined,
            rewardDescription: updateDto.difficulty
              ? this.generateSystemRewardDescription(updateDto.difficulty)
              : undefined,
            startsAt: updateDto.startsAt
              ? new Date(updateDto.startsAt)
              : undefined,
            status: updateDto.status,
            sections:
              updateDto.sections && updateDto.sections.length > 0
                ? {
                    deleteMany: {},
                    ...this.buildSectionsCreateInput(id, updateDto.sections)!,
                  }
                : undefined,
          },
        });

        return { challenge: existing, updated: result };
      },
      { timeout: ChallengesService.TX_TIMEOUT_MS },
    );

    if (role === Role.COMPANY && userId && challenge.companyId) {
      const changedKeys = Object.keys(updateDto);
      await this.companiesService.logAction(
        challenge.companyId,
        userId,
        'UPDATE_CHALLENGE',
        'CHALLENGE',
        challenge.id,
        { changedFields: changedKeys },
      );
    }

    return updated;
  }

  async getTemplates() {
    return this.prisma.challenge.findMany({
      where: { isTemplate: true },
      include: {
        sections: {
          include: { components: true },
        },
      },
    });
  }

  async cloneTemplate(templateId: string, companyId: string, userId: string) {
    const template = await this.prisma.challenge.findUnique({
      where: { id: templateId, isTemplate: true },
      include: {
        sections: {
          include: { components: true },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Template tidak ditemukan');
    }

    const newChallenge = await this.withSlugRetry(template.title, (slug) =>
      this.prisma.$transaction(
        async (tx) => {
          const company = await this.lockCompany(tx, companyId);
          await this.assertCompanyQuota(tx, company);

          const challengeId = crypto.randomUUID();

          return tx.challenge.create({
            data: {
              id: challengeId,
              companyId,
              title: template.title,
              slug,
              summary: template.summary,
              description: template.description,
              category: template.category,
              difficulty: template.difficulty,
              datasetUrl: template.datasetUrl,
              mockApiUrl: template.mockApiUrl,
              brandGuidelineUrl: template.brandGuidelineUrl,
              gradingRubric: template.gradingRubric ?? {},
              rewardDescription: template.rewardDescription,
              status: ChallengeStatus.DRAFT, // Always draft on clone
              isPrivate: false,
              isTemplate: false, // Ensure it's not a template
              challengeType: ChallengeType.COMPANY,
              sections: {
                create: template.sections.map((s) => ({
                  title: s.title,
                  description: s.description,
                  order: s.order,
                  stageType: s.stageType,
                  timeLimit: s.timeLimit,
                  components: {
                    create: s.components.map((c) => ({
                      challengeId: challengeId,
                      type: c.type,
                      question: c.question,
                      description: c.description,
                      options: c.options ?? undefined,
                      metadata: c.metadata ?? undefined,
                      points: c.points,
                      order: c.order,
                    })),
                  },
                })),
              },
            },
          });
        },
        { timeout: ChallengesService.TX_TIMEOUT_MS },
      ),
    );

    await this.companiesService.logAction(
      companyId,
      userId,
      'CLONE_TEMPLATE',
      'CHALLENGE',
      newChallenge.id,
      { templateId },
    );

    return newChallenge;
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
