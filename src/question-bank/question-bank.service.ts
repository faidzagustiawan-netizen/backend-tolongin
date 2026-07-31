import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateQuestionBankItemDto,
  QueryQuestionBankDto,
  QuestionBankScope,
  UpdateQuestionBankItemDto,
} from './dto/question-bank.dto';

/**
 * Identitas pemanggil sebagaimana dibawa token. `role` bertipe string karena
 * itulah yang keluar dari JWT; perbandingannya tetap memakai enum `Role`.
 */
type Caller = {
  sub: string;
  role: string;
  profileId?: string | null;
};

@Injectable()
export class QuestionBankService {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly DEFAULT_LIMIT = 24;
  private static readonly MAX_LIMIT = 100;

  /**
   * `_count.usedBy` = berapa kali soal ini benar-benar dipakai di studi kasus.
   *
   * Koleksi soal selama ini kotak hitam: menabung berbiaya sekarang dan
   * berbuah entah kapan. Angka ini yang memperlihatkan buahnya.
   */
  private static readonly ITEM_INCLUDE = {
    tags: { include: { skill: { select: { id: true, name: true } } } },
    _count: { select: { usedBy: true } },
  } satisfies Prisma.QuestionBankItemInclude;

  /**
   * Syarat keterlihatan.
   *
   * Soal platform (`companyId: null`) terbuka untuk semua; koleksi pribadi
   * hanya untuk pemiliknya. Talenta tidak punya profil perusahaan, jadi
   * baginya hanya ada bank platform — bukan pembatasan yang disengaja,
   * melainkan konsekuensi tidak adanya tempat menyimpan koleksi pribadi.
   */
  private visibilityFilter(
    caller: Caller,
    scope: QuestionBankScope,
  ): Prisma.QuestionBankItemWhereInput {
    const isCompany = caller.role === Role.COMPANY && !!caller.profileId;

    if (scope === QuestionBankScope.PLATFORM) {
      return { companyId: null };
    }

    if (scope === QuestionBankScope.MINE) {
      // Tanpa profil perusahaan tidak ada koleksi pribadi yang bisa cocok.
      // Menyaring dengan `companyId: null` di sini akan salah: itu justru
      // mengembalikan seluruh bank platform sebagai "milik saya".
      return isCompany ? { companyId: caller.profileId! } : { id: '__none__' };
    }

    return isCompany
      ? { OR: [{ companyId: null }, { companyId: caller.profileId! }] }
      : { companyId: null };
  }

  async findAll(query: QueryQuestionBankDto, caller: Caller) {
    const scope = query.scope ?? QuestionBankScope.ALL;

    const and: Prisma.QuestionBankItemWhereInput[] = [
      this.visibilityFilter(caller, scope),
    ];

    // Soal yang ditarik peredarannya tetap tersimpan demi ujian yang sudah
    // memakainya, tetapi tidak boleh muncul lagi saat memilih.
    and.push({ isActive: true });

    // Soal lintas bidang (`category: null`) selalu ikut. Menyaring kategori
    // secara harfiah akan menyembunyikan seluruh soal soft skill, wawancara,
    // dan etika kerja — justru yang paling luas dipakai — dari setiap
    // pencarian yang menyebut satu bidang.
    if (query.category) {
      and.push({ OR: [{ category: query.category }, { category: null }] });
    }

    if (query.difficulty) and.push({ difficulty: query.difficulty });
    if (query.type) and.push({ type: query.type });

    const skillIds = (query.skillIds ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (skillIds.length > 0) {
      and.push({ tags: { some: { skillId: { in: skillIds } } } });
    }

    if (query.search) {
      and.push({
        OR: [
          { question: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(
      QuestionBankService.MAX_LIMIT,
      Math.max(1, Number(query.limit) || QuestionBankService.DEFAULT_LIMIT),
    );

    const where: Prisma.QuestionBankItemWhereInput = { AND: and };

    const [data, total] = await Promise.all([
      this.prisma.questionBankItem.findMany({
        where,
        include: QuestionBankService.ITEM_INCLUDE,
        // Koleksi pribadi lebih dulu: yang disusun sendiri oleh perusahaan
        // hampir selalu lebih relevan daripada soal bawaan platform.
        orderBy: [{ companyId: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.questionBankItem.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Daftar penanda yang benar-benar terpakai di bank, beserta jumlah soalnya.
   *
   * Direktori `skills` memuat ribuan keahlian talenta; menawarkan semuanya
   * sebagai penyaring akan menyodorkan ratusan pilihan yang tidak
   * mengembalikan apa pun.
   */
  async findTags(caller: Caller, scope: QuestionBankScope) {
    const visible = this.visibilityFilter(caller, scope);

    const grouped = await this.prisma.questionBankItemSkill.groupBy({
      by: ['skillId'],
      where: { item: { AND: [visible, { isActive: true }] } },
      _count: { skillId: true },
    });

    if (grouped.length === 0) return [];

    const skills = await this.prisma.skill.findMany({
      where: { id: { in: grouped.map((row) => row.skillId) } },
      select: { id: true, name: true },
    });

    const countBySkill = new Map(
      grouped.map((row) => [row.skillId, row._count.skillId]),
    );

    return skills
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        questionCount: countBySkill.get(skill.id) ?? 0,
      }))
      .sort((a, b) => b.questionCount - a.questionCount);
  }

  async findOne(id: string, caller: Caller) {
    const item = await this.prisma.questionBankItem.findFirst({
      where: {
        AND: [{ id }, this.visibilityFilter(caller, QuestionBankScope.ALL)],
      },
      include: QuestionBankService.ITEM_INCLUDE,
    });

    if (!item) throw new NotFoundException('Soal tidak ditemukan');
    return item;
  }

  /**
   * Menyimpan soal ke bank.
   *
   * Admin menulis ke bank platform (`companyId: null`); perusahaan hanya ke
   * koleksinya sendiri. Pemiliknya tidak pernah diambil dari badan permintaan,
   * supaya satu perusahaan tidak bisa menitipkan soal atas nama perusahaan
   * lain — apalagi ke bank platform.
   */
  async create(dto: CreateQuestionBankItemDto, caller: Caller) {
    const companyId = this.resolveOwner(caller);
    const skillIds = await this.validateSkillIds(dto.skillIds);

    return this.prisma.questionBankItem.create({
      data: {
        companyId,
        type: dto.type,
        question: dto.question,
        description: dto.description,
        options: dto.options ?? undefined,
        metadata: dto.metadata ?? undefined,
        defaultPoints: dto.defaultPoints ?? 10,
        category: dto.category ?? null,
        difficulty: dto.difficulty,
        tags:
          skillIds.length > 0
            ? { create: skillIds.map((skillId) => ({ skillId })) }
            : undefined,
      },
      include: QuestionBankService.ITEM_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateQuestionBankItemDto, caller: Caller) {
    const existing = await this.assertCanManage(id, caller);
    const skillIds =
      dto.skillIds !== undefined
        ? await this.validateSkillIds(dto.skillIds)
        : null;

    return this.prisma.questionBankItem.update({
      where: { id: existing.id },
      data: {
        question: dto.question,
        description: dto.description,
        options: dto.options !== undefined ? dto.options : undefined,
        metadata: dto.metadata !== undefined ? dto.metadata : undefined,
        defaultPoints: dto.defaultPoints,
        category: dto.category,
        difficulty: dto.difficulty,
        isActive: dto.isActive,
        // Penanda ditulis ulang seluruhnya bila dikirim, termasuk saat
        // dikosongkan — syarat "ada isinya" akan membuat penghapusan penanda
        // terakhir diam-diam diabaikan.
        tags:
          skillIds !== null
            ? {
                deleteMany: {},
                create: skillIds.map((skillId) => ({ skillId })),
              }
            : undefined,
      },
      include: QuestionBankService.ITEM_INCLUDE,
    });
  }

  /**
   * Menarik soal dari peredaran.
   *
   * Barisnya sengaja tidak dihapus: `challenge_components.sourceItemId`
   * menunjuk ke sini sebagai jejak asal, dan menghapusnya akan memutus
   * penelusuran soal mana yang dipakai di ujian mana.
   */
  async deactivate(id: string, caller: Caller) {
    const existing = await this.assertCanManage(id, caller);

    return this.prisma.questionBankItem.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
  }

  private resolveOwner(caller: Caller): string | null {
    if (caller.role === Role.ADMIN) return null;

    if (caller.role !== Role.COMPANY || !caller.profileId) {
      throw new ForbiddenException(
        'Hanya perusahaan yang dapat menyimpan soal ke koleksi pribadi.',
      );
    }

    return caller.profileId;
  }

  private async assertCanManage(id: string, caller: Caller) {
    const item = await this.prisma.questionBankItem.findUnique({
      where: { id },
      select: { id: true, companyId: true },
    });

    if (!item) throw new NotFoundException('Soal tidak ditemukan');

    if (caller.role === Role.ADMIN) return item;

    if (!item.companyId || item.companyId !== caller.profileId) {
      throw new ForbiddenException(
        'Soal bawaan platform maupun milik perusahaan lain tidak dapat diubah.',
      );
    }

    return item;
  }

  /**
   * Id skill yang tidak ada dibuang lebih dulu.
   *
   * Tanpa ini Prisma menolak seluruh penulisan dengan galat kunci asing yang
   * tidak menyebutkan id mana yang salah, dan permintaannya muncul ke pengguna
   * sebagai galat 500.
   */
  private async validateSkillIds(skillIds?: string[]): Promise<string[]> {
    const unique = Array.from(new Set(skillIds ?? [])).filter(Boolean);
    if (unique.length === 0) return [];

    const found = await this.prisma.skill.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });

    return found.map((skill) => skill.id);
  }
}
