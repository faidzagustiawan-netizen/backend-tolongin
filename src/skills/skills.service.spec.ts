import { BadRequestException } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

/**
 * Direktori tiruan. `findFirst` menirukan pencocokan tanpa memandang besar
 * kecil huruf sebagaimana Postgres dengan `mode: 'insensitive'`, karena persis
 * di situlah "Backend Development" dan "backend development" harus dianggap
 * baris yang sama.
 */
function makePrisma(initial: string[]) {
  const rows = initial.map((name, index) => ({ id: `s${index}`, name }));

  return {
    rows,
    skill: {
      findMany: jest.fn(async () => rows.map((r) => ({ ...r }))),
      findUnique: jest.fn(async ({ where }: any) => {
        return rows.find((r) => r.name === where.name) ?? null;
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const wanted = String(where.name.equals).toLowerCase();
        return rows.find((r) => r.name.toLowerCase() === wanted) ?? null;
      }),
      create: jest.fn(async ({ data }: any) => {
        const created = { id: `s${rows.length}`, name: data.name };
        rows.push(created);
        return created;
      }),
    },
    challenge: { groupBy: jest.fn(async () => []) },
  };
}

const DIRECTORY = [
  'Backend Development',
  'Frontend Development',
  'UI/UX Design',
  'Data Science / ML',
  'React',
];

describe('SkillsService.resolveCategory', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let ai: { resolveDirectoryEntry: jest.Mock };
  let service: SkillsService;

  beforeEach(() => {
    prisma = makePrisma(DIRECTORY);
    ai = { resolveDirectoryEntry: jest.fn() };
    service = new SkillsService(
      prisma as unknown as PrismaService,
      ai as unknown as AiService,
    );
  });

  it('mengenali bidang yang sudah ada tanpa memanggil AI', async () => {
    const result = await service.resolveCategory('backend development');

    expect(result.status).toBe('EXACT');
    expect(ai.resolveDirectoryEntry).not.toHaveBeenCalled();
    if (result.status === 'EXACT') {
      expect(result.category.name).toBe('Backend Development');
    }
  });

  it('menawarkan pembetulan saat AI menilai ketikannya salah eja', async () => {
    ai.resolveDirectoryEntry.mockResolvedValue({
      verdict: 'typo',
      canonical: 'Backend Development',
      reason: 'Sepertinya yang Anda maksud Backend Development.',
    });

    const result = await service.resolveCategory('backen');

    expect(result.status).toBe('SUGGESTION');
    if (result.status === 'SUGGESTION') {
      expect(result.suggestion.name).toBe('Backend Development');
      expect(result.input).toBe('backen');
    }
    // Yang belum disetujui perusahaan tidak boleh diam-diam masuk direktori.
    expect(prisma.skill.create).not.toHaveBeenCalled();
  });

  it('menambahkan bidang baru yang sah ke direktori saat itu juga', async () => {
    ai.resolveDirectoryEntry.mockResolvedValue({
      verdict: 'new',
      canonical: 'Video Editor',
      reason: 'Profesi yang sah dan belum ada di daftar.',
    });

    const result = await service.resolveCategory('video editor');

    expect(result.status).toBe('CREATED');
    if (result.status === 'CREATED') {
      expect(result.category.name).toBe('Video Editor');
    }
    expect(prisma.skill.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Video Editor' } }),
    );
  });

  it('tidak memaksakan pembetulan untuk profesi berbeda yang ejaannya mirip', async () => {
    ai.resolveDirectoryEntry.mockResolvedValue({
      verdict: 'new',
      canonical: 'Data Engineer',
      reason: 'Berbeda dari Data Science / ML.',
    });

    const result = await service.resolveCategory('Data Engineer');

    expect(result.status).toBe('CREATED');
    expect(ai.resolveDirectoryEntry).toHaveBeenCalledWith(
      'Data Engineer',
      expect.arrayContaining(['Data Science / ML']),
      'category',
    );
  });

  it('menolak teks yang bukan bidang pekerjaan tanpa menambah baris', async () => {
    ai.resolveDirectoryEntry.mockResolvedValue({
      verdict: 'invalid',
      canonical: null,
      reason: 'Teks ini tidak dikenali sebagai bidang pekerjaan.',
    });

    const result = await service.resolveCategory('asdkjhasd');

    expect(result.status).toBe('REJECTED');
    expect(prisma.skill.create).not.toHaveBeenCalled();
  });

  it('menerima nama rapian AI yang ternyata sudah ada sebagai EXACT', async () => {
    ai.resolveDirectoryEntry.mockResolvedValue({
      verdict: 'new',
      canonical: 'Backend Development',
      reason: '',
    });

    const result = await service.resolveCategory('Back-end Dev');

    expect(result.status).toBe('EXACT');
    expect(prisma.skill.create).not.toHaveBeenCalled();
  });

  it('memperlakukan putusan typo yang tidak menunjuk kandidat mana pun sebagai bidang baru', async () => {
    // Model kadang mengarang nama yang tidak ada di daftar; usulan semacam itu
    // tidak bisa dipakai karena tidak menunjuk baris mana pun.
    ai.resolveDirectoryEntry.mockResolvedValue({
      verdict: 'typo',
      canonical: 'Bidang Yang Tidak Ada',
      reason: '',
    });

    const result = await service.resolveCategory('Sutradara');

    expect(result.status).toBe('CREATED');
    if (result.status === 'CREATED') {
      expect(result.category.name).toBe('Bidang Yang Tidak Ada');
    }
  });

  describe('saat AI tidak dapat dihubungi', () => {
    beforeEach(() => {
      ai.resolveDirectoryEntry.mockRejectedValue(new Error('AI_NOT_CONFIGURED'));
    });

    it('menawarkan pembetulan hanya untuk kemiripan yang sangat dekat', async () => {
      const result = await service.resolveCategory('React');
      // "React" persis ada, jadi jalur ini tidak terpakai; pakai salah ketiknya.
      expect(result.status).toBe('EXACT');

      const typo = await service.resolveCategory('Reactt');
      expect(typo.status).toBe('SUGGESTION');
      if (typo.status === 'SUGGESTION') {
        expect(typo.suggestion.name).toBe('React');
      }
    });

    it('menerima bidang yang jauh dari semua yang ada apa adanya', async () => {
      const result = await service.resolveCategory('Akuntan');

      expect(result.status).toBe('CREATED');
      if (result.status === 'CREATED') {
        expect(result.category.name).toBe('Akuntan');
        expect(result.aiChecked).toBe(false);
      }
    });
  });

  it('force melewati AI tetapi tetap tidak menggandakan baris yang ada', async () => {
    const created = await service.resolveCategory('Penulis Naskah', true);
    expect(created.status).toBe('CREATED');
    expect(ai.resolveDirectoryEntry).not.toHaveBeenCalled();

    const again = await service.resolveCategory('penulis naskah', true);
    expect(again.status).toBe('EXACT');
    expect(prisma.skill.create).toHaveBeenCalledTimes(1);
  });

  it('menolak ketikan yang terlalu pendek atau terlalu panjang', async () => {
    await expect(service.resolveCategory('a')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.resolveCategory('x'.repeat(61)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('SkillsService — kosakata keahlian', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let ai: { resolveDirectoryEntry: jest.Mock };
  let service: SkillsService;

  beforeEach(() => {
    prisma = makePrisma(DIRECTORY);
    ai = { resolveDirectoryEntry: jest.fn() };
    service = new SkillsService(
      prisma as unknown as PrismaService,
      ai as unknown as AiService,
    );
  });

  it('menilai ketikan dengan ukuran keahlian, bukan bidang pekerjaan', async () => {
    // Satu tabel menampung dua kosakata. Menilai "Kubernetes" dengan ukuran
    // bidang pekerjaan akan menolaknya sebagai bukan profesi.
    ai.resolveDirectoryEntry.mockResolvedValue({
      verdict: 'new',
      canonical: 'Kubernetes',
      reason: 'Teknologi yang sah.',
    });

    const result = await service.resolveCategory('kubernetes', false, 'skill');

    expect(result.status).toBe('CREATED');
    expect(ai.resolveDirectoryEntry).toHaveBeenCalledWith(
      'kubernetes',
      expect.any(Array),
      'skill',
    );
  });

  it('memakai kata "Keahlian" pada pesan penolakan', async () => {
    ai.resolveDirectoryEntry.mockResolvedValue({
      verdict: 'invalid',
      canonical: null,
      reason: '',
    });

    const result = await service.resolveCategory('zzzqqq', false, 'skill');

    expect(result.status).toBe('REJECTED');
    expect(result.reason).toContain('keahlian');
  });
});

describe('SkillsService.createSkill — gerbang tulis tunggal', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: SkillsService;

  beforeEach(() => {
    prisma = makePrisma(DIRECTORY);
    service = new SkillsService(
      prisma as unknown as PrismaService,
      { resolveDirectoryEntry: jest.fn() } as unknown as AiService,
    );
  });

  it('menolak nama kosong, terlalu pendek, dan terlalu panjang', async () => {
    for (const bad of ['', '   ', 'x', 'y'.repeat(61)]) {
      await expect(service.createSkill(bad)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(prisma.skill.create).not.toHaveBeenCalled();
  });

  it('merapikan spasi berlebih sebelum menyimpan', async () => {
    const created = await service.createSkill('  Adobe   Illustrator  ');

    expect(created.name).toBe('Adobe Illustrator');
  });

  it('tidak menggandakan baris yang beda huruf besar-kecil saja', async () => {
    const again = await service.createSkill('backend development');

    expect(again.name).toBe('Backend Development');
    expect(prisma.skill.create).not.toHaveBeenCalled();
  });

  it('entri baru langsung terlihat oleh pencarian jarak ketik', async () => {
    await service.createSkill('Kubernetes');

    // Tanpa penulisan langsung ke cache, entri ini baru muncul setelah cache
    // kedaluwarsa — persis saat pengguna paling mungkin mengetiknya lagi.
    const hasil = await service.searchSkills('Kubernetees');

    expect(hasil.map((s: any) => s.name)).toContain('Kubernetes');
  });
});

describe('SkillsService.searchSkills — urutan hasil', () => {
  it('mendahulukan yang diawali ketikan, lalu nama terpendek', async () => {
    const prisma = makePrisma([
      'Frontend Development',
      'React',
      'React Native',
      'Preact',
    ]);
    // `contains` ditirukan supaya urutan dari basis data sengaja terbalik dari
    // yang diharapkan — itulah yang dulu bocor apa adanya ke pengguna.
    prisma.skill.findMany = jest.fn(async ({ where }: any) => {
      const q = String(where.name.contains).toLowerCase();
      return prisma.rows
        .filter((r) => r.name.toLowerCase().includes(q))
        .reverse()
        .map((r) => ({ ...r }));
    }) as any;

    const service = new SkillsService(
      prisma as unknown as PrismaService,
      { resolveDirectoryEntry: jest.fn() } as unknown as AiService,
    );

    const hasil = await service.searchSkills('react');

    expect(hasil.map((s: any) => s.name)).toEqual([
      'React',
      'React Native',
      'Preact',
    ]);
  });
});

describe('SkillsService.resolveCategoryId', () => {
  it('mengembalikan null untuk nama kosong — artinya lintas bidang', async () => {
    const prisma = makePrisma(DIRECTORY);
    const service = new SkillsService(
      prisma as unknown as PrismaService,
      { resolveDirectoryEntry: jest.fn() } as unknown as AiService,
    );

    await expect(service.resolveCategoryId('')).resolves.toBeNull();
    await expect(service.resolveCategoryId(undefined)).resolves.toBeNull();
    await expect(service.resolveCategoryId('   ')).resolves.toBeNull();
    expect(prisma.skill.create).not.toHaveBeenCalled();
  });

  it('membuat baris baru untuk bidang yang belum ada, tanpa melibatkan AI', async () => {
    const prisma = makePrisma(DIRECTORY);
    const ai = { resolveDirectoryEntry: jest.fn() };
    const service = new SkillsService(
      prisma as unknown as PrismaService,
      ai as unknown as AiService,
    );

    const id = await service.resolveCategoryId('Akuntan');

    expect(id).toBeTruthy();
    expect(ai.resolveDirectoryEntry).not.toHaveBeenCalled();
    expect(prisma.skill.create).toHaveBeenCalledTimes(1);
  });
});
