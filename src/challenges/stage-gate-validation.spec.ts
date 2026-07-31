import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ChallengesService } from './challenges.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { TokensService } from '../tokens/tokens.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CompaniesService } from '../companies/companies.service';
import { SkillsService } from '../skills/skills.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';

/**
 * Aturan gerbang tahap semuanya menjawab satu pertanyaan: apakah masih ada jalan
 * bagi kandidat sampai ke tahap terakhir? Salah setel tidak memunculkan galat
 * apa pun saat dibuat, dan akibatnya baru terlihat setelah studi kasus terbit —
 * saat mana soalnya sudah tidak bisa disunting lagi.
 */
describe('ChallengesService — validasi gerbang tahap', () => {
  let service: ChallengesService;

  const base = {
    title: 'Studi Kasus Bertahap',
    summary: 'Ringkas',
    description: 'Deskripsi',
    category: 'Frontend Development',
    difficulty: 'INTERMEDIATE',
    status: 'PUBLISHED',
  };

  /** Satu tahap berisi satu soal pilihan ganda yang sah. */
  const stage = (over: Record<string, unknown> = {}) => ({
    title: 'Tahap',
    order: 0,
    components: [
      {
        type: 'MULTIPLE_CHOICE',
        question: 'Soal',
        points: 10,
        options: [
          { id: 'a', text: 'A', isCorrect: true },
          { id: 'b', text: 'B', isCorrect: false },
        ],
      },
    ],
    ...over,
  });

  const publish = (sections: unknown[]) =>
    service.create(
      'co-1',
      { ...base, sections } as unknown as CreateChallengeDto,
      'u-1',
    );

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChallengesService,
        // Validasi berjalan sebelum satu pun query dijalankan, jadi tiruan
        // kosong sudah cukup: setiap pengujian di bawah harus gagal di
        // pemeriksaan, bukan di basis data.
        { provide: PrismaService, useValue: {} },
        { provide: AiService, useValue: {} },
        { provide: TokensService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: CompaniesService, useValue: { logAction: jest.fn() } },
        {
          provide: SkillsService,
          useValue: { resolveCategoryId: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    service = module.get<ChallengesService>(ChallengesService);
  });

  it('menolak tahap pertama yang bergerbang', async () => {
    await expect(
      publish([stage({ gateMode: 'MIN_SCORE', minScore: 70 })]),
    ).rejects.toThrow(/tahap pertama/);
  });

  it('menolak nilai minimal yang tidak diisi', async () => {
    await expect(
      publish([
        stage({ title: 'Tahap 1', order: 0 }),
        stage({ title: 'Tahap 2', order: 1, gateMode: 'MIN_SCORE' }),
      ]),
    ).rejects.toThrow(/nilai minimal harus diisi/);
  });

  it('menolak kuota tanpa waktu tutup', async () => {
    // Peringkat baru bermakna setelah tahap ditutup; tanpa `closesAt` tidak ada
    // saat yang bisa dipakai memutuskan siapa yang teratas.
    await expect(
      publish([
        stage({ title: 'Tahap 1', order: 0 }),
        stage({
          title: 'Tahap 2',
          order: 1,
          gateMode: 'TOP_N',
          maxAdvancing: 10,
        }),
      ]),
    ).rejects.toThrow(/waktu tutup harus diisi/);
  });

  it('menolak masa tunggu yang tidak diisi saat tahap dibuka otomatis', async () => {
    await expect(
      publish([
        stage({ title: 'Tahap 1', order: 0 }),
        stage({
          title: 'Tahap 2',
          order: 1,
          gateMode: 'MIN_SCORE',
          minScore: 70,
          pendingPolicy: 'AUTO_ADVANCE_AFTER',
        }),
      ]),
    ).rejects.toThrow(/hari tunggu harus diisi/);
  });

  it('menolak tahap sumber nilai yang dikerjakan lebih belakangan', async () => {
    // Dua tahap yang saling menunggu mengunci kandidat permanen tanpa satu pun
    // galat saat dibuat.
    await expect(
      publish([
        stage({ id: 'sec-1', title: 'Tahap 1', order: 0 }),
        stage({
          id: 'sec-2',
          title: 'Tahap 2',
          order: 1,
          gateMode: 'MIN_SCORE',
          minScore: 70,
          scoreBasis: 'SPECIFIC_STAGES',
          gateSourceIds: ['sec-3'],
        }),
        stage({ id: 'sec-3', title: 'Tahap 3', order: 2 }),
      ]),
    ).rejects.toThrow(/dikerjakan lebih dulu/);
  });

  it('menolak tahap sumber nilai yang sudah tidak ada', async () => {
    await expect(
      publish([
        stage({ id: 'sec-1', title: 'Tahap 1', order: 0 }),
        stage({
          id: 'sec-2',
          title: 'Tahap 2',
          order: 1,
          gateMode: 'MIN_SCORE',
          minScore: 70,
          scoreBasis: 'SPECIFIC_STAGES',
          gateSourceIds: ['sec-yang-sudah-dihapus'],
        }),
      ]),
    ).rejects.toThrow(/sudah tidak ada/);
  });

  it('menolak ambang nilai atas tahap yang seluruhnya psikometrik', async () => {
    // Skala Likert tidak punya jawaban benar, jadi tidak ada angka untuk
    // dibandingkan dengan ambang apa pun.
    await expect(
      publish([
        stage({
          title: 'Tahap 1',
          order: 0,
          components: [
            {
              type: 'PSYCHOMETRIC',
              question: 'Saya suka bekerja dalam tim',
              points: 0,
              metadata: { dimension: 'Kolaborasi', scaleMin: 1, scaleMax: 5 },
            },
          ],
        }),
        stage({
          title: 'Tahap 2',
          order: 1,
          gateMode: 'MIN_SCORE',
          minScore: 70,
        }),
      ]),
    ).rejects.toThrow(/psikometrik/);
  });

  it('menolak waktu tutup yang lebih awal daripada waktu buka', async () => {
    await expect(
      publish([
        stage({
          title: 'Tahap 1',
          order: 0,
          opensAt: '2026-08-10T00:00:00.000Z',
          closesAt: '2026-08-05T00:00:00.000Z',
        }),
      ]),
    ).rejects.toThrow(/lebih lambat daripada waktu buka/);
  });

  it('menolak jendela tahap yang keluar dari batas akhir challenge', async () => {
    await expect(
      service.create(
        'co-1',
        {
          ...base,
          deadlineAt: '2026-08-10T00:00:00.000Z',
          sections: [
            stage({
              title: 'Tahap 1',
              order: 0,
              closesAt: '2026-08-20T00:00:00.000Z',
            }),
          ],
        } as unknown as CreateChallengeDto,
        'u-1',
      ),
    ).rejects.toThrow(/melewati batas akhir challenge/);
  });

  it('meloloskan rangkaian gerbang yang sah', async () => {
    // Yang diuji hanya bahwa validasi tidak menolak. Pemanggilannya tetap gagal
    // karena PrismaService di sini tiruan kosong — yang penting galatnya bukan
    // BadRequestException, yaitu bukan berasal dari pemeriksaan.
    await expect(
      publish([
        stage({ id: 'sec-1', title: 'Tahap 1', order: 0 }),
        stage({
          id: 'sec-2',
          title: 'Tahap 2',
          order: 1,
          gateMode: 'MIN_SCORE',
          minScore: 70,
          scoreBasis: 'SPECIFIC_STAGES',
          gateSourceIds: ['sec-1'],
          pendingPolicy: 'AUTO_ADVANCE_AFTER',
          graceDays: 3,
        }),
      ]),
    ).rejects.not.toBeInstanceOf(BadRequestException);
  });
});
