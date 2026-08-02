import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { QuestionBankService } from './question-bank.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionBankScope } from './dto/question-bank.dto';
import { SkillsService } from '../skills/skills.service';

describe('QuestionBankService', () => {
  let service: QuestionBankService;
  let prisma: any;

  const company = { sub: 'u-1', role: 'COMPANY', profileId: 'co-1' };
  const otherCompany = { sub: 'u-2', role: 'COMPANY', profileId: 'co-2' };
  const talent = { sub: 'u-3', role: 'TALENT', profileId: 'talent-1' };
  const admin = { sub: 'u-4', role: 'ADMIN', profileId: undefined };

  beforeEach(async () => {
    prisma = {
      questionBankItem: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'item-1' }),
        update: jest.fn().mockResolvedValue({ id: 'item-1' }),
      },
      questionBankItemSkill: { groupBy: jest.fn().mockResolvedValue([]) },
      skill: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionBankService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: SkillsService,
          useValue: {
            resolveCategoryId: jest
              .fn()
              .mockImplementation(async (name?: string | null) =>
                name?.trim() ? `cat-${name.trim().toLowerCase()}` : null,
              ),
          },
        },
      ],
    }).compile();

    service = module.get(QuestionBankService);
  });

  /** Syarat keterlihatan yang benar-benar dikirim ke Prisma. */
  const visibilityUsed = () =>
    prisma.questionBankItem.findMany.mock.calls[0][0].where.AND[0];

  describe('keterlihatan', () => {
    it('perusahaan melihat bank platform beserta koleksinya sendiri', async () => {
      await service.findAll({}, company);

      expect(visibilityUsed()).toEqual({
        OR: [{ companyId: null }, { companyId: 'co-1' }],
      });
    });

    it('tidak pernah menyertakan koleksi perusahaan lain', async () => {
      await service.findAll({}, company);

      expect(JSON.stringify(visibilityUsed())).not.toContain('co-2');
    });

    it('scope MINE hanya koleksi pribadi, bukan bank platform', async () => {
      await service.findAll({ scope: QuestionBankScope.MINE }, company);

      expect(visibilityUsed()).toEqual({ companyId: 'co-1' });
    });

    it('scope MINE untuk talenta tidak jatuh ke seluruh bank platform', async () => {
      // Jebakannya: `companyId: null` di sini akan mengembalikan seluruh bank
      // platform sebagai "milik saya".
      await service.findAll({ scope: QuestionBankScope.MINE }, talent);

      expect(visibilityUsed()).not.toEqual({ companyId: null });
      expect(visibilityUsed()).toEqual({ id: '__none__' });
    });

    it('talenta hanya melihat bank platform', async () => {
      await service.findAll({}, talent);

      expect(visibilityUsed()).toEqual({ companyId: null });
    });

    it('selalu menyaring soal yang sudah ditarik peredarannya', async () => {
      await service.findAll({}, company);

      const conditions =
        prisma.questionBankItem.findMany.mock.calls[0][0].where.AND;
      expect(conditions).toContainEqual({ isActive: true });
    });
  });

  describe('penyaring', () => {
    it('mencocokkan salah satu penanda, bukan seluruhnya', async () => {
      await service.findAll({ skillIds: 'sk-1, sk-2 ,' }, company);

      const conditions =
        prisma.questionBankItem.findMany.mock.calls[0][0].where.AND;
      expect(conditions).toContainEqual({
        tags: { some: { skillId: { in: ['sk-1', 'sk-2'] } } },
      });
    });

    it('menyertakan soal lintas bidang saat menyaring kategori', async () => {
      // Tanpa ini seluruh soal soft skill dan wawancara lenyap dari setiap
      // pencarian yang menyebut satu bidang.
      await service.findAll({ category: 'Backend Development' }, company);

      const conditions =
        prisma.questionBankItem.findMany.mock.calls[0][0].where.AND;
      expect(conditions).toContainEqual({
        OR: [
          {
            category: {
              is: {
                name: {
                  equals: 'Backend Development',
                  mode: 'insensitive',
                },
              },
            },
          },
          { categoryId: null },
        ],
      });
    });

    it('membatasi limit yang berlebihan', async () => {
      await service.findAll({ limit: '5000' }, company);

      expect(prisma.questionBankItem.findMany.mock.calls[0][0].take).toBe(100);
    });
  });

  describe('create', () => {
    it('perusahaan menulis ke koleksinya sendiri', async () => {
      await service.create(
        {
          type: 'ESSAY',
          question: 'Q',
          category: 'BACKEND',
          difficulty: 'INTERMEDIATE',
        } as any,
        company,
      );

      expect(
        prisma.questionBankItem.create.mock.calls[0][0].data.companyId,
      ).toBe('co-1');
    });

    it('admin menulis ke bank platform', async () => {
      await service.create(
        {
          type: 'ESSAY',
          question: 'Q',
          category: 'BACKEND',
          difficulty: 'INTERMEDIATE',
        } as any,
        admin,
      );

      expect(
        prisma.questionBankItem.create.mock.calls[0][0].data.companyId,
      ).toBeNull();
    });

    it('talenta tidak punya tempat menyimpan koleksi pribadi', async () => {
      await expect(
        service.create(
          {
            type: 'ESSAY',
            question: 'Q',
            category: 'BACKEND',
            difficulty: 'INTERMEDIATE',
          } as any,
          talent,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('membuang id skill yang tidak ada sebelum menulis', async () => {
      prisma.skill.findMany.mockResolvedValue([{ id: 'sk-1' }]);

      await service.create(
        {
          type: 'ESSAY',
          question: 'Q',
          category: 'BACKEND',
          difficulty: 'INTERMEDIATE',
          skillIds: ['sk-1', 'sk-hantu'],
        } as any,
        company,
      );

      expect(prisma.questionBankItem.create.mock.calls[0][0].data.tags).toEqual(
        {
          create: [{ skillId: 'sk-1' }],
        },
      );
    });
  });

  describe('kepemilikan saat menyunting', () => {
    it('menolak menyunting soal milik perusahaan lain', async () => {
      prisma.questionBankItem.findUnique.mockResolvedValue({
        id: 'item-1',
        companyId: 'co-1',
      });

      await expect(
        service.update('item-1', { question: 'Baru' }, otherCompany),
      ).rejects.toThrow(ForbiddenException);
    });

    it('menolak perusahaan menyunting soal bawaan platform', async () => {
      prisma.questionBankItem.findUnique.mockResolvedValue({
        id: 'item-1',
        companyId: null,
      });

      await expect(
        service.update('item-1', { question: 'Baru' }, company),
      ).rejects.toThrow(ForbiddenException);
    });

    it('admin boleh menyunting soal bawaan platform', async () => {
      prisma.questionBankItem.findUnique.mockResolvedValue({
        id: 'item-1',
        companyId: null,
      });

      await expect(
        service.update('item-1', { question: 'Baru' }, admin),
      ).resolves.toBeDefined();
    });

    it('mengosongkan penanda ketika skillIds dikirim kosong', async () => {
      prisma.questionBankItem.findUnique.mockResolvedValue({
        id: 'item-1',
        companyId: 'co-1',
      });

      await service.update('item-1', { skillIds: [] }, company);

      expect(prisma.questionBankItem.update.mock.calls[0][0].data.tags).toEqual(
        {
          deleteMany: {},
          create: [],
        },
      );
    });

    it('tidak menyentuh penanda ketika skillIds tidak dikirim', async () => {
      prisma.questionBankItem.findUnique.mockResolvedValue({
        id: 'item-1',
        companyId: 'co-1',
      });

      await service.update('item-1', { question: 'Baru' }, company);

      expect(
        prisma.questionBankItem.update.mock.calls[0][0].data.tags,
      ).toBeUndefined();
    });

    it('galat 404 untuk soal yang tidak ada', async () => {
      prisma.questionBankItem.findUnique.mockResolvedValue(null);

      await expect(
        service.update('hantu', { question: 'Baru' }, company),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('menandai tidak aktif alih-alih menghapus baris', async () => {
      prisma.questionBankItem.findUnique.mockResolvedValue({
        id: 'item-1',
        companyId: 'co-1',
      });

      await service.deactivate('item-1', company);

      expect(prisma.questionBankItem.update.mock.calls[0][0].data).toEqual({
        isActive: false,
      });
    });
  });
});
