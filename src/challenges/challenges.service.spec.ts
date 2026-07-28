import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ChallengesService } from './challenges.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { TokensService } from '../tokens/tokens.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CompaniesService } from '../companies/companies.service';
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

  const publicDto = {
    title: 'Studi Kasus Komunitas',
    summary: 'Ringkas',
    description: 'Deskripsi',
    category: 'FRONTEND',
    difficulty: 'INTERMEDIATE',
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
      },
      notification: { create: jest.fn() },
      $queryRaw: jest.fn(),
    };

    prisma = {
      // Cukup jalankan callback dengan klien transaksi tiruan; kegagalan di
      // dalamnya merambat keluar persis seperti transaksi yang dibatalkan.
      $transaction: jest.fn((fn: any) => fn(tx)),
      challenge: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    tokens = {
      spendTokensWithin: jest.fn().mockResolvedValue({ success: true }),
      earnTokens: jest.fn().mockResolvedValue({ success: true }),
    };

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
        { provide: CompaniesService, useValue: { logAction: jest.fn() } },
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

    beforeEach(() => {
      tx.companyProfile.findUnique.mockResolvedValue({
        id: 'co-1',
        userId: 'owner-1',
        subscriptionTier: 'STARTUP',
      });
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
          category: 'FRONTEND',
          difficulty: 'INTERMEDIATE',
          blueprint: { title: 'Draf' },
        } as any),
      ).rejects.toThrow(/Fitur AI Generator dikunci/);
      expect(tx.challenge.count).not.toHaveBeenCalled();
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
