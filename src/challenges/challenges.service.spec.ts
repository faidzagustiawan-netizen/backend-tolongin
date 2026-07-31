import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ChallengesService } from './challenges.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { TokensService } from '../tokens/tokens.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CompaniesService } from '../companies/companies.service';
import { SkillsService } from '../skills/skills.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';

const slugConflict = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['slug'] },
  });

describe('ChallengesService', () => {
  let service: ChallengesService;
  let tx: any;
  let prisma: any;
  let tokens: any;
  let companies: any;

  // Status bawaan pembuatan adalah PUBLISHED, dan penerbitan mensyaratkan
  // minimal satu tahap — jadi fixture bersama ini harus membawanya.
  const publicDto = {
    title: 'Studi Kasus Komunitas',
    summary: 'Ringkas',
    description: 'Deskripsi',
    category: 'Frontend Development',
    difficulty: 'INTERMEDIATE',
    sections: [{ title: 'Tahap 1', order: 0, components: [] }],
  } as unknown as CreateChallengeDto;

  beforeEach(async () => {
    tx = {
      talentProfile: { findUnique: jest.fn() },
      companyProfile: { findUnique: jest.fn() },
      challenge: {
        create: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        // Slug baru dicari di dalam transaksi ketika judul draf berubah.
        findUnique: jest.fn().mockResolvedValue(null),
      },
      notification: { create: jest.fn() },
      // Section ditulis lewat kliennya sendiri, bukan sebagai nested write di
      // dalam `challenge.update`, supaya urutan hapus-lalu-buat pasti.
      challengeSection: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      challengeComponent: { deleteMany: jest.fn() },
      $queryRaw: jest.fn(),
    };
    // Kuota kosong secara bawaan; setiap pengujian kuota menimpanya sendiri.
    tx.challenge.count.mockResolvedValue(0);

    prisma = {
      // Cukup jalankan callback dengan klien transaksi tiruan; kegagalan di
      // dalamnya merambat keluar persis seperti transaksi yang dibatalkan.
      $transaction: jest.fn((fn: any) => fn(tx)),
      challenge: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        // archiveChallenge bekerja di luar transaksi.
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };
    prisma.$transaction = jest.fn((arg: any) =>
      typeof arg === 'function' ? arg(tx) : Promise.all(arg),
    );

    tokens = {
      spendTokensWithin: jest.fn().mockResolvedValue({ success: true }),
      earnTokens: jest.fn().mockResolvedValue({ success: true }),
    };

    companies = { logAction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChallengesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AiService,
          useValue: { generateChallengeContent: jest.fn() },
        },
        { provide: TokensService, useValue: tokens },
        { provide: NotificationsService, useValue: {} },
        { provide: CompaniesService, useValue: companies },
        {
          provide: SkillsService,
          useValue: {
            // Bidang pekerjaan ditukar menjadi id direktori sebelum transaksi.
            resolveCategoryId: jest
              .fn()
              .mockImplementation(async (name?: string | null) =>
                name?.trim() ? `cat-${name.trim().toLowerCase()}` : null,
              ),
          },
        },
      ],
    }).compile();

    service = module.get<ChallengesService>(ChallengesService);
  });

  describe('createPublic', () => {
    it('tidak memotong token bila profil talenta tidak ditemukan', async () => {
      tx.talentProfile.findUnique.mockResolvedValue(null);

      await expect(service.createPublic('user-1', publicDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(tokens.spendTokensWithin).not.toHaveBeenCalled();
    });

    it('memotong token pada transaksi yang sama dengan pembuatan challenge', async () => {
      tx.talentProfile.findUnique.mockResolvedValue({
        id: 'talent-1',
        userId: 'user-1',
      });
      tx.challenge.create.mockResolvedValue({
        id: 'ch-1',
        title: publicDto.title,
        slug: 'studi-kasus-komunitas-abcd1234',
        status: 'PUBLISHED',
      });

      await service.createPublic('user-1', publicDto);

      expect(tokens.spendTokensWithin).toHaveBeenCalledTimes(1);
      // Argumen pertama harus klien transaksi, bukan PrismaService global —
      // itulah yang membuat pemotongan token ikut dibatalkan saat gagal.
      expect(tokens.spendTokensWithin.mock.calls[0][0]).toBe(tx);
      expect(tokens.spendTokensWithin.mock.calls[0][2]).toBe(50);
    });

    it('merambatkan kegagalan pembuatan challenge sehingga transaksi dibatalkan', async () => {
      tx.talentProfile.findUnique.mockResolvedValue({
        id: 'talent-1',
        userId: 'user-1',
      });
      tx.challenge.create.mockRejectedValue(new Error('penulisan gagal'));

      await expect(service.createPublic('user-1', publicDto)).rejects.toThrow(
        'penulisan gagal',
      );
    });
  });

  describe('slug', () => {
    it('mencoba slug baru ketika penulisan bentrok P2002', async () => {
      tx.talentProfile.findUnique.mockResolvedValue({
        id: 'talent-1',
        userId: 'user-1',
      });
      tx.challenge.create
        .mockRejectedValueOnce(slugConflict())
        .mockResolvedValueOnce({
          id: 'ch-1',
          title: publicDto.title,
          slug: 'studi-kasus-komunitas-ffff0000',
          status: 'PUBLISHED',
        });

      const result = await service.createPublic('user-1', publicDto);

      expect(result.id).toBe('ch-1');
      expect(tx.challenge.create).toHaveBeenCalledTimes(2);

      const firstSlug = tx.challenge.create.mock.calls[0][0].data.slug;
      const secondSlug = tx.challenge.create.mock.calls[1][0].data.slug;
      expect(firstSlug).not.toBe(secondSlug);
    });

    it('melewati kandidat slug yang sudah dipakai', async () => {
      prisma.challenge.findUnique
        .mockResolvedValueOnce({ id: 'lain' })
        .mockResolvedValueOnce(null);
      tx.talentProfile.findUnique.mockResolvedValue({
        id: 'talent-1',
        userId: 'user-1',
      });
      tx.challenge.create.mockResolvedValue({
        id: 'ch-1',
        title: publicDto.title,
        slug: 's',
        status: 'PUBLISHED',
      });

      await service.createPublic('user-1', publicDto);

      expect(prisma.challenge.findUnique).toHaveBeenCalledTimes(2);
    });

    it('tidak menelan galat selain bentrok slug', async () => {
      tx.talentProfile.findUnique.mockResolvedValue({
        id: 'talent-1',
        userId: 'user-1',
      });
      const other = new Prisma.PrismaClientKnownRequestError('gagal', {
        code: 'P2003',
        clientVersion: 'test',
      });
      tx.challenge.create.mockRejectedValue(other);

      await expect(service.createPublic('user-1', publicDto)).rejects.toThrow(
        other,
      );
      expect(tx.challenge.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('kuota perusahaan', () => {
    const companyDto = { ...publicDto };

    // Batas paket dimatikan secara bawaan selama pengembangan
    // (lihat common/dev-flags.ts). Aturannya tetap diuji dengan menyalakan
    // saklarnya di sini, supaya isinya tidak diam-diam membusuk sampai hari
    // penegakannya dinyalakan kembali.
    beforeEach(() => {
      process.env.ENFORCE_SUBSCRIPTION_LIMITS = 'true';
      tx.companyProfile.findUnique.mockResolvedValue({
        id: 'co-1',
        userId: 'owner-1',
        subscriptionTier: 'STARTUP',
      });
    });

    afterEach(() => {
      delete process.env.ENFORCE_SUBSCRIPTION_LIMITS;
    });

    it('mengunci baris perusahaan sebelum menghitung kuota', async () => {
      tx.challenge.count.mockResolvedValue(0);
      tx.challenge.create.mockResolvedValue({
        id: 'ch-1',
        title: companyDto.title,
        slug: 's',
        status: 'PUBLISHED',
      });

      await service.create('co-1', companyDto, 'user-1');

      expect(tx.$queryRaw).toHaveBeenCalled();
      const lockSql = tx.$queryRaw.mock.calls[0][0].join('');
      expect(lockSql).toContain('FOR UPDATE');
      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.challenge.count.mock.invocationCallOrder[0],
      );
    });

    it('menolak pembuatan saat kuota paket Murah sudah penuh', async () => {
      tx.challenge.count.mockResolvedValue(1);

      await expect(
        service.create('co-1', companyDto, 'user-1'),
      ).rejects.toThrow(/Paket Murah/);
      expect(tx.challenge.create).not.toHaveBeenCalled();
    });

    it('memberi pesan fitur AI terkunci, bukan pesan kuota, pada paket Murah', async () => {
      await expect(
        service.generateAiChallenge('co-1', {
          prompt: 'p',
          category: 'Frontend Development',
          difficulty: 'INTERMEDIATE',
          blueprint: { title: 'Draf' },
        } as any),
      ).rejects.toThrow(/Fitur AI Generator dikunci/);
      expect(tx.challenge.count).not.toHaveBeenCalled();
    });

    it('membiarkan pembuatan lewat saat batas langganan dimatikan', async () => {
      delete process.env.ENFORCE_SUBSCRIPTION_LIMITS;
      tx.challenge.count.mockResolvedValue(99);
      tx.challenge.create.mockResolvedValue({
        id: 'ch-1',
        title: companyDto.title,
        slug: 's',
        status: 'PUBLISHED',
      });

      await service.create('co-1', companyDto, 'user-1');

      expect(tx.challenge.create).toHaveBeenCalled();
    });
  });

  describe('kuota Public Challenge talenta', () => {
    beforeEach(() => {
      tx.talentProfile.findUnique.mockResolvedValue({
        id: 'talent-1',
        userId: 'user-1',
      });
    });

    it('menolak saat talenta sudah punya 3 challenge aktif/draf', async () => {
      tx.challenge.count.mockResolvedValue(3);

      await expect(service.createPublic('user-1', publicDto)).rejects.toThrow(
        /3 Public Challenge aktif/,
      );
      expect(tokens.spendTokensWithin).not.toHaveBeenCalled();
      expect(tx.challenge.create).not.toHaveBeenCalled();
    });

    it('mengunci baris talenta sebelum menghitung kuota', async () => {
      tx.challenge.create.mockResolvedValue({
        id: 'ch-1',
        title: publicDto.title,
        slug: 's',
        status: 'PUBLISHED',
      });

      await service.createPublic('user-1', publicDto);

      expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE');
      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.challenge.count.mock.invocationCallOrder[0],
      );
    });
  });

  describe('validasi konsistensi', () => {
    beforeEach(() => {
      tx.talentProfile.findUnique.mockResolvedValue({
        id: 'talent-1',
        userId: 'user-1',
      });
    });

    it('menolak batas akhir yang lebih awal daripada tanggal mulai', async () => {
      await expect(
        service.createPublic('user-1', {
          ...publicDto,
          startsAt: '2026-09-01T00:00:00.000Z',
          deadlineAt: '2026-08-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(/lebih lambat daripada tanggal mulai/);
    });

    it('menolak soal pilihan ganda tanpa jawaban benar saat diterbitkan', async () => {
      await expect(
        service.createPublic('user-1', {
          ...publicDto,
          status: 'PUBLISHED',
          sections: [
            {
              title: 'B1',
              order: 0,
              components: [
                {
                  type: 'MULTIPLE_CHOICE',
                  question: 'Q',
                  options: [
                    { text: 'a', isCorrect: false },
                    { text: 'b', isCorrect: false },
                  ],
                },
              ],
            },
          ],
        } as unknown as CreateChallengeDto),
      ).rejects.toThrow(/tepat satu jawaban benar/);
    });

    it('membiarkan draf setengah jadi tersimpan', async () => {
      tx.challenge.create.mockResolvedValue({
        id: 'ch-1',
        title: publicDto.title,
        slug: 's',
        status: 'DRAFT',
      });

      await expect(
        service.createPublic('user-1', {
          ...publicDto,
          status: 'DRAFT',
          sections: [
            {
              title: 'B1',
              order: 0,
              components: [
                { type: 'MULTIPLE_CHOICE', question: 'Q', options: [] },
              ],
            },
          ],
        } as unknown as CreateChallengeDto),
      ).resolves.toBeDefined();
    });

    it('menolak total bobot rubrik yang bukan 100 pada penilaian holistik', async () => {
      await expect(
        service.createPublic('user-1', {
          ...publicDto,
          status: 'PUBLISHED',
          gradingRubric: { kualitas: 40, kecepatan: 40 },
        } as unknown as CreateChallengeDto),
      ).rejects.toThrow(/harus 100%, saat ini 80%/);
    });

    it('mengabaikan bobot rubrik ketika penilaian memakai poin soal', async () => {
      tx.challenge.create.mockResolvedValue({
        id: 'ch-1',
        title: publicDto.title,
        slug: 's',
        status: 'PUBLISHED',
      });

      await expect(
        service.createPublic('user-1', {
          ...publicDto,
          status: 'PUBLISHED',
          gradingRubric: { kualitas: 40, kecepatan: 40 },
          sections: [
            {
              title: 'B1',
              order: 0,
              components: [{ type: 'ESSAY', question: 'Q', points: 10 }],
            },
          ],
        } as unknown as CreateChallengeDto),
      ).resolves.toBeDefined();
    });
  });

  describe('findAll', () => {
    it('mine=true menyaring milik pemanggil dan menyertakan draf', async () => {
      await service.findAll(
        { mine: 'true' },
        {
          role: 'TALENT',
          profileId: 'talent-1',
        },
      );

      const where = prisma.challenge.findMany.mock.calls[0][0].where;
      // CLOSED ikut serta: yang diarsipkan harus tetap bisa ditemukan
      // pemiliknya, sebab tidak ada daftar lain yang memuatnya.
      expect(where.status).toEqual({ in: ['PUBLISHED', 'DRAFT', 'CLOSED'] });
      expect(where.isPrivate).toBeUndefined();
      expect(where.AND).toContainEqual({
        OR: [{ companyId: 'talent-1' }, { talentId: 'talent-1' }],
      });
    });

    it('tamu hanya melihat challenge terbit dan tidak privat', async () => {
      await service.findAll({}, undefined);

      const where = prisma.challenge.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('PUBLISHED');
      expect(where.isPrivate).toBe(false);
    });

    it('menggabungkan pencarian dan kepemilikan tanpa saling menimpa', async () => {
      await service.findAll(
        { mine: 'true', search: 'react' },
        {
          role: 'COMPANY',
          profileId: 'co-1',
        },
      );

      const where = prisma.challenge.findMany.mock.calls[0][0].where;
      expect(where.AND).toHaveLength(2);
    });
  });

  describe('updateChallenge', () => {
    const draft = {
      id: 'ch-1',
      title: 'Draf Lama',
      slug: 'draf-lama-0000',
      status: 'DRAFT',
      companyId: 'co-1',
      talentId: null,
      startsAt: null,
      deadlineAt: null,
      sections: [{ components: [] }],
    };

    it('admin boleh menyunting tanpa penyaring kepemilikan', async () => {
      tx.challenge.findFirst.mockResolvedValue(draft);
      tx.challenge.update.mockResolvedValue({ ...draft, title: 'Baru' });

      await service.updateChallenge(
        'ch-1',
        undefined as any,
        { title: 'Baru' },
        'admin-1',
        'ADMIN',
      );

      expect(tx.challenge.findFirst.mock.calls[0][0].where).toEqual({
        id: 'ch-1',
      });
    });

    it('menolak pemanggil non-admin tanpa profil', async () => {
      await expect(
        service.updateChallenge('ch-1', undefined as any, {}, 'u-1', 'COMPANY'),
      ).rejects.toThrow(/tidak memiliki profil/);
      expect(tx.challenge.findFirst).not.toHaveBeenCalled();
    });

    it('menyimpan deadlineAt yang sebelumnya terlewat', async () => {
      tx.challenge.findFirst.mockResolvedValue(draft);
      tx.challenge.update.mockResolvedValue(draft);

      await service.updateChallenge(
        'ch-1',
        'co-1',
        { deadlineAt: '2026-09-01T00:00:00.000Z' },
        'u-1',
        'COMPANY',
      );

      expect(tx.challenge.update.mock.calls[0][0].data.deadlineAt).toEqual(
        new Date('2026-09-01T00:00:00.000Z'),
      );
    });

    it('memeriksa section dari basis data saat permintaan hanya mengubah status', async () => {
      // Inti bug lama: `PATCH { status: 'PUBLISHED' }` polos membuat daftar
      // section dianggap kosong, sehingga soal rusak ikut terbit.
      tx.challenge.findFirst.mockResolvedValue({
        ...draft,
        sections: [
          {
            components: [
              {
                type: 'MULTIPLE_CHOICE',
                question: 'Q',
                options: [{ text: 'a', isCorrect: false }],
              },
            ],
          },
        ],
      });

      await expect(
        service.updateChallenge(
          'ch-1',
          'co-1',
          { status: 'PUBLISHED' } as any,
          'u-1',
          'COMPANY',
        ),
      ).rejects.toThrow(/minimal 2 opsi jawaban/);
      expect(tx.challenge.update).not.toHaveBeenCalled();
    });

    it('menolak penerbitan studi kasus tanpa satu pun tahap', async () => {
      tx.challenge.findFirst.mockResolvedValue({ ...draft, sections: [] });

      await expect(
        service.updateChallenge(
          'ch-1',
          'co-1',
          { status: 'PUBLISHED' } as any,
          'u-1',
          'COMPANY',
        ),
      ).rejects.toThrow(/minimal satu tahap/);
    });

    it('menghapus seluruh tahap ketika sections dikirim kosong', async () => {
      tx.challenge.findFirst.mockResolvedValue(draft);
      tx.challenge.update.mockResolvedValue(draft);

      await service.updateChallenge(
        'ch-1',
        'co-1',
        { sections: [] },
        'u-1',
        'COMPANY',
      );

      // Tanpa satu pun tahap yang dipertahankan, penghapusan sengaja tidak
      // membawa penyaring id — artinya "buang semua".
      expect(tx.challengeSection.deleteMany).toHaveBeenCalledWith({
        where: { challengeId: 'ch-1' },
      });
      expect(tx.challengeSection.create).not.toHaveBeenCalled();
      expect(tx.challengeSection.update).not.toHaveBeenCalled();
    });

    it('mempertahankan id tahap yang sudah ada alih-alih membuatnya ulang', async () => {
      tx.challenge.findFirst.mockResolvedValue({
        ...draft,
        sections: [{ id: 'sec-1', components: [] }],
      });
      tx.challenge.update.mockResolvedValue(draft);

      await service.updateChallenge(
        'ch-1',
        'co-1',
        {
          sections: [
            { id: 'sec-1', title: 'Tahap 1', order: 0, components: [] },
            { title: 'Tahap 2', order: 1, components: [] },
          ],
        },
        'u-1',
        'COMPANY',
      );

      // Yang sudah ada diperbarui di tempat; hanya tahap tanpa id yang dibuat.
      expect(tx.challengeSection.deleteMany).toHaveBeenCalledWith({
        where: { challengeId: 'ch-1', id: { notIn: ['sec-1'] } },
      });
      expect(tx.challengeSection.update).toHaveBeenCalledTimes(1);
      expect(tx.challengeSection.update.mock.calls[0][0].where).toEqual({
        id: 'sec-1',
      });
      expect(tx.challengeSection.create).toHaveBeenCalledTimes(1);
      expect(tx.challengeSection.create.mock.calls[0][0].data).toMatchObject({
        challengeId: 'ch-1',
        title: 'Tahap 2',
        order: 1,
      });
    });

    it('mengabaikan id tahap yang bukan milik challenge ini', async () => {
      tx.challenge.findFirst.mockResolvedValue({
        ...draft,
        sections: [{ id: 'sec-1', components: [] }],
      });
      tx.challenge.update.mockResolvedValue(draft);

      await service.updateChallenge(
        'ch-1',
        'co-1',
        {
          sections: [
            {
              id: 'sec-milik-orang-lain',
              title: 'Tahap 1',
              order: 0,
              components: [],
            },
          ],
        },
        'u-1',
        'COMPANY',
      );

      // Id asing tidak boleh menjadi sasaran update — kalau tidak, jalur ini
      // bisa dipakai menulisi section milik perusahaan lain.
      expect(tx.challengeSection.update).not.toHaveBeenCalled();
      expect(tx.challengeSection.create).toHaveBeenCalledTimes(1);
    });

    it('menyegarkan slug ketika judul draf berubah', async () => {
      tx.challenge.findFirst.mockResolvedValue(draft);
      tx.challenge.update.mockResolvedValue(draft);

      await service.updateChallenge(
        'ch-1',
        'co-1',
        { title: 'Judul Baru' },
        'u-1',
        'COMPANY',
      );

      expect(tx.challenge.update.mock.calls[0][0].data.slug).toMatch(
        /^judul-baru-/,
      );
    });

    it('tidak menyentuh slug ketika judul tidak berubah', async () => {
      tx.challenge.findFirst.mockResolvedValue(draft);
      tx.challenge.update.mockResolvedValue(draft);

      await service.updateChallenge(
        'ch-1',
        'co-1',
        { title: draft.title },
        'u-1',
        'COMPANY',
      );

      expect(tx.challenge.update.mock.calls[0][0].data.slug).toBeUndefined();
    });

    it('memberi notifikasi kepada pemilik saat draf naik jadi terbit', async () => {
      tx.challenge.findFirst.mockResolvedValue(draft);
      tx.challenge.update.mockResolvedValue({
        ...draft,
        status: 'PUBLISHED',
      });
      tx.companyProfile.findUnique.mockResolvedValue({ userId: 'owner-1' });

      await service.updateChallenge(
        'ch-1',
        'co-1',
        { status: 'PUBLISHED' } as any,
        'u-1',
        'COMPANY',
      );

      expect(tx.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'owner-1' }),
        }),
      );
    });

    it('mencatat jejak audit juga saat yang menyunting adalah admin', async () => {
      tx.challenge.findFirst.mockResolvedValue(draft);
      tx.challenge.update.mockResolvedValue(draft);

      await service.updateChallenge(
        'ch-1',
        undefined as any,
        { title: 'Baru' },
        'admin-1',
        'ADMIN',
      );

      expect(companies.logAction).toHaveBeenCalledWith(
        'co-1',
        'admin-1',
        'UPDATE_CHALLENGE',
        'CHALLENGE',
        'ch-1',
        expect.objectContaining({ actorRole: 'ADMIN' }),
      );
    });
  });

  describe('archiveChallenge', () => {
    const published = {
      id: 'ch-1',
      title: 'Sudah Terbit',
      status: 'PUBLISHED',
      companyId: 'co-1',
      talentId: null,
    };

    it('menutup studi kasus terbit sehingga slot kuota kembali bebas', async () => {
      prisma.challenge.findFirst.mockResolvedValue(published);
      prisma.challenge.update.mockResolvedValue({
        ...published,
        status: 'CLOSED',
      });

      const result = await service.archiveChallenge(
        'ch-1',
        'co-1',
        'u-1',
        'COMPANY',
      );

      expect(result.status).toBe('CLOSED');
      expect(prisma.challenge.update.mock.calls[0][0].data).toEqual({
        status: 'CLOSED',
      });
    });

    it('menyaring kepemilikan untuk pemanggil non-admin', async () => {
      prisma.challenge.findFirst.mockResolvedValue(published);
      prisma.challenge.update.mockResolvedValue(published);

      await service.archiveChallenge('ch-1', 'co-1', 'u-1', 'COMPANY');

      expect(prisma.challenge.findFirst.mock.calls[0][0].where).toEqual({
        id: 'ch-1',
        OR: [{ companyId: 'co-1' }, { talentId: 'co-1' }],
      });
    });

    it('menolak pengarsipan ganda', async () => {
      prisma.challenge.findFirst.mockResolvedValue({
        ...published,
        status: 'CLOSED',
      });

      await expect(
        service.archiveChallenge('ch-1', 'co-1', 'u-1', 'COMPANY'),
      ).rejects.toThrow(/sudah diarsipkan/);
    });
  });

  describe('processAiChallengeBackground', () => {
    const runBackground = (refund?: { amount: number; reason: string }) =>
      (service as any).processAiChallengeBackground(
        'ch-1',
        'user-1',
        { blueprint: {}, difficulty: 'INTERMEDIATE' },
        refund,
      );

    beforeEach(() => {
      prisma.notification = { create: jest.fn().mockResolvedValue({}) };
      const ai = (service as any).aiService;
      ai.generateChallengeContent.mockRejectedValue(new Error('AI mati'));
    });

    it('mengembalikan token talenta ketika generasi AI gagal', async () => {
      await runBackground({ amount: 50, reason: 'Pengembalian' });

      expect(tokens.earnTokens).toHaveBeenCalledWith(
        'user-1',
        50,
        'Pengembalian',
      );
      expect(
        prisma.notification.create.mock.calls[0][0].data.content,
      ).toContain('50 Token telah dikembalikan');
    });

    it('tidak mengembalikan token untuk challenge perusahaan yang gratis', async () => {
      await runBackground();

      expect(tokens.earnTokens).not.toHaveBeenCalled();
      expect(
        prisma.notification.create.mock.calls[0][0].data.content,
      ).not.toContain('dikembalikan');
    });

    it('tetap memberi tahu pengguna ketika pengembalian token ikut gagal', async () => {
      tokens.earnTokens.mockRejectedValue(new Error('refund gagal'));

      await expect(
        runBackground({ amount: 50, reason: 'Pengembalian' }),
      ).resolves.toBeUndefined();
      expect(prisma.notification.create).toHaveBeenCalled();
    });
  });
});
