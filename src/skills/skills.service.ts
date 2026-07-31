import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService, DirectoryEntryKind } from '../ai/ai.service';

export interface SkillRef {
  id: string;
  name: string;
}

export type { DirectoryEntryKind };

/**
 * Hasil pemeriksaan entri direktori yang diketik sendiri oleh pengguna —
 * bidang pekerjaan oleh perusahaan, atau keahlian oleh talenta.
 *
 * - `EXACT`    — persis sama dengan yang sudah ada di direktori.
 * - `CREATED`  — entri baru yang sah, sudah ditambahkan ke direktori.
 * - `SUGGESTION` — kemungkinan salah ketik; pengguna yang memutuskan.
 * - `REJECTED` — bukan entri yang sah, tidak ditambahkan.
 */
export type CategoryResolution =
  | { status: 'EXACT'; category: SkillRef; reason: string; aiChecked: boolean }
  | { status: 'CREATED'; category: SkillRef; reason: string; aiChecked: boolean }
  | {
      status: 'SUGGESTION';
      input: string;
      suggestion: SkillRef;
      reason: string;
      aiChecked: boolean;
    }
  | {
      status: 'REJECTED';
      input: string;
      suggestions: SkillRef[];
      reason: string;
      aiChecked: boolean;
    };

@Injectable()
export class SkillsService {
  private cachedSkills: SkillRef[] = [];
  private cacheTimestamp = 0;
  private readonly logger = new Logger(SkillsService.name);

  /** Ketikan di luar rentang ini tidak layak masuk direktori. */
  static readonly MIN_NAME_LENGTH = 2;
  static readonly MAX_NAME_LENGTH = 60;

  /**
   * Umur cache daftar nama untuk pencocokan jarak ketik.
   *
   * Sengaja pendek. Penambahan entri hanya membatalkan cache pada proses yang
   * menuliskannya; proses lain dalam mode cluster tetap memakai salinan lamanya
   * sampai kedaluwarsa. Satu menit membuat mereka menyusul sendiri, alih-alih
   * menyembunyikan entri baru selama lima menit dari separuh permintaan.
   */
  private static readonly CACHE_TTL_MS = 60_000;

  /** Banyaknya kandidat terdekat yang disodorkan ke AI sebagai pembanding. */
  private static readonly MAX_CANDIDATES = 8;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) == a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1),
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  private async allSkills(): Promise<SkillRef[]> {
    const now = Date.now();
    if (now - this.cacheTimestamp > SkillsService.CACHE_TTL_MS) {
      this.cachedSkills = await this.prisma.skill.findMany({
        select: { id: true, name: true },
      });
      this.cacheTimestamp = now;
    }
    return this.cachedSkills;
  }

  /** Kandidat terdekat berdasarkan jarak ketik, tanpa memandang ambang. */
  private async nearestByDistance(
    query: string,
    limit = Number.POSITIVE_INFINITY,
  ): Promise<(SkillRef & { dist: number })[]> {
    const q = query.toLowerCase();
    const scored = (await this.allSkills()).map((s) => {
      const skillName = s.name.toLowerCase();
      // Jarak ke seluruh kata
      const dist1 = this.levenshtein(q, skillName);
      // Jarak ke awalan sepanjang ketikan
      const dist2 =
        skillName.length >= q.length
          ? this.levenshtein(q, skillName.substring(0, q.length))
          : dist1;

      return { ...s, dist: Math.min(dist1, dist2) };
    });

    scored.sort((a, b) => a.dist - b.dist);
    return scored.slice(0, limit);
  }

  async searchSkills(query: string) {
    if (!query) return [];

    // 1. Try exact/contains search first
    const exactMatches = await this.prisma.skill.findMany({
      where: {
        name: {
          contains: query,
          mode: 'insensitive',
        },
      },
      take: 20,
    });

    if (exactMatches.length > 0) {
      // Urutan datang dari basis data, jadi "Frontend Development" bisa
      // mendahului "React" untuk ketikan "re" hanya karena lebih dulu dibuat.
      // Yang diawali ketikan hampir selalu yang dimaksud; sesudah itu nama
      // terpendek, karena yang panjang biasanya entri lain yang kebetulan
      // memuat potongan kata yang sama.
      const q = query.trim().toLowerCase();
      return [...exactMatches].sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        if (a.name.length !== b.name.length) return a.name.length - b.name.length;
        return a.name.localeCompare(b.name);
      });
    }

    // 2. Fallback to Levenshtein distance for typos (e.g. ui/uz -> UI/UX)
    const scored = await this.nearestByDistance(query);

    // Return top 5 matches that have a reasonable distance (<= 3 typos)
    return scored
      .filter((s) => s.dist <= 3)
      .slice(0, 5)
      .map((s) => ({ id: s.id, name: s.name, _dist: s.dist }));
  }

  /**
   * Satu-satunya pintu tulis ke direktori.
   *
   * Setiap jalur bermuara di sini — POST /skills, pemeriksaan AI, dan penukaran
   * nama bidang saat studi kasus disimpan — jadi di sinilah kelayakan nama
   * diperiksa. Sebelumnya pemeriksaan hanya ada di `resolveCategory`, sehingga
   * klien yang memanggil POST /skills langsung bisa menitipkan string sepanjang
   * apa pun, dan sejak direktori ini juga menyetir bidang pekerjaan, isian
   * sembarangan dari layar keahlian talenta muncul sebagai saran bidang bagi
   * perusahaan.
   */
  async createSkill(name: string) {
    const finalName = this.normalizeName(name ?? '');
    this.assertUsableName(finalName);

    // Pencocokan tanpa memandang besar-kecil huruf: `findUnique` hanya
    // menangkap yang identik, sehingga "backend development" akan lolos menjadi
    // baris kedua di samping "Backend Development".
    const existing = await this.findByNameInsensitive(finalName);
    if (existing) return existing;

    const created = await this.prisma.skill.create({
      data: { name: finalName },
      select: { id: true, name: true },
    });

    // Ditulis langsung ke cache, bukan sekadar membatalkannya: entri yang baru
    // dibuat harus segera terlihat oleh pencarian jarak ketik — persis pada saat
    // pengguna paling mungkin mengetiknya lagi.
    this.cachedSkills = [...this.cachedSkills, created];

    return created;
  }

  /** Batas yang berlaku sama untuk bidang pekerjaan maupun keahlian. */
  private assertUsableName(name: string): void {
    if (name.length < SkillsService.MIN_NAME_LENGTH) {
      throw new BadRequestException(
        `Nama minimal ${SkillsService.MIN_NAME_LENGTH} karakter.`,
      );
    }
    if (name.length > SkillsService.MAX_NAME_LENGTH) {
      throw new BadRequestException(
        `Nama maksimal ${SkillsService.MAX_NAME_LENGTH} karakter.`,
      );
    }
  }

  /**
   * Bidang pekerjaan yang benar-benar dipakai, diurutkan dari yang tersering.
   *
   * Direktori keahlian memuat "React" dan "Komunikasi" juga, yang bukan bidang
   * pekerjaan. Daftar ini menyaringnya berdasarkan pemakaian nyata, sehingga
   * pilihan awal yang dilihat perusahaan tetap masuk akal tanpa perlu daftar
   * statis yang harus dirawat tangan.
   */
  async listCategories(limit = 12): Promise<(SkillRef & { usage: number })[]> {
    const grouped = await this.prisma.challenge.groupBy({
      by: ['categoryId'],
      where: { categoryId: { not: null } },
      _count: { categoryId: true },
      orderBy: { _count: { categoryId: 'desc' } },
      take: limit,
    });

    const ids = grouped
      .map((g) => g.categoryId)
      .filter((id): id is string => id !== null);
    if (ids.length === 0) return [];

    const skills = await this.prisma.skill.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const byId = new Map(skills.map((s) => [s.id, s]));

    return grouped
      .map((g) => {
        const skill = g.categoryId ? byId.get(g.categoryId) : undefined;
        return skill
          ? { ...skill, usage: g._count.categoryId }
          : null;
      })
      .filter((s): s is SkillRef & { usage: number } => s !== null);
  }

  private normalizeName(raw: string): string {
    return raw.trim().replace(/\s+/g, ' ');
  }

  private async findByNameInsensitive(name: string): Promise<SkillRef | null> {
    const found = await this.prisma.skill.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    return found;
  }

  /**
   * Memeriksa entri yang diketik pengguna, lalu menambahkannya ke direktori
   * bila memang entri baru yang sah.
   *
   * `kind` memilih ukuran kelayakannya: bidang pekerjaan bagi perusahaan,
   * keahlian bagi talenta. Keduanya berbagi satu tabel tetapi tidak berbagi
   * definisi sah — "React" keahlian yang benar dan bukan bidang pekerjaan.
   *
   * `force` dipakai ketika pengguna sudah melihat usulan pembetulan dan tetap
   * memilih ketikannya sendiri. Yang dilewati hanya langkah AI — pemeriksaan
   * duplikat tetap berjalan, jadi jalur ini tidak bisa dipakai menggandakan
   * entri yang sudah ada.
   */
  async resolveCategory(
    rawName: string,
    force = false,
    kind: DirectoryEntryKind = 'category',
  ): Promise<CategoryResolution> {
    const noun = kind === 'skill' ? 'Keahlian' : 'Bidang pekerjaan';
    const name = this.normalizeName(rawName ?? '');

    if (name.length < SkillsService.MIN_NAME_LENGTH) {
      throw new BadRequestException(
        `${noun} minimal ${SkillsService.MIN_NAME_LENGTH} karakter.`,
      );
    }
    if (name.length > SkillsService.MAX_NAME_LENGTH) {
      throw new BadRequestException(
        `${noun} maksimal ${SkillsService.MAX_NAME_LENGTH} karakter.`,
      );
    }

    const exact = await this.findByNameInsensitive(name);
    if (exact) {
      return {
        status: 'EXACT',
        category: exact,
        reason: `${noun} ini sudah ada di direktori.`,
        aiChecked: false,
      };
    }

    if (force) {
      const created = await this.createSkill(name);
      return {
        status: 'CREATED',
        category: { id: created.id, name: created.name },
        reason: `${noun} ditambahkan sesuai ketikan Anda.`,
        aiChecked: false,
      };
    }

    const candidates = await this.nearestByDistance(
      name,
      SkillsService.MAX_CANDIDATES,
    );

    let verdict: 'typo' | 'new' | 'invalid';
    let canonical: string | null;
    let reason: string;

    try {
      const decision = await this.ai.resolveDirectoryEntry(
        name,
        candidates.map((c) => c.name),
        kind,
      );
      verdict = decision.verdict;
      canonical = decision.canonical;
      reason = decision.reason;
    } catch (error: any) {
      // AI mati bukan alasan menolak entri yang mungkin sah. Jatuh ke jarak
      // ketik saja: hanya kemiripan yang sangat dekat (<= 2) yang ditawarkan
      // sebagai pembetulan, sisanya diterima apa adanya.
      this.logger.warn(
        `Pemeriksaan ${kind} jatuh ke jarak ketik: ${error?.message ?? error}`,
      );
      const nearest = candidates[0];
      if (nearest && nearest.dist <= 2) {
        return {
          status: 'SUGGESTION',
          input: name,
          suggestion: { id: nearest.id, name: nearest.name },
          reason: `Mirip dengan "${nearest.name}" yang sudah ada. Pilih salah satu.`,
          aiChecked: false,
        };
      }
      const created = await this.createSkill(name);
      return {
        status: 'CREATED',
        category: { id: created.id, name: created.name },
        reason: `${noun} ditambahkan ke direktori.`,
        aiChecked: false,
      };
    }

    if (verdict === 'invalid') {
      return {
        status: 'REJECTED',
        input: name,
        suggestions: candidates
          .filter((c) => c.dist <= 4)
          .slice(0, 5)
          .map((c) => ({ id: c.id, name: c.name })),
        reason:
          reason || `Teks ini tidak dikenali sebagai ${noun.toLowerCase()}.`,
        aiChecked: true,
      };
    }

    if (verdict === 'typo') {
      // Model diminta menyalin persis salah satu kandidat. Kalau meleset,
      // usulannya tidak menunjuk baris mana pun di direktori dan tidak bisa
      // dipakai — perlakukan sebagai entri baru daripada menawarkan pembetulan
      // yang tidak ada wujudnya.
      const target = canonical
        ? candidates.find(
            (c) => c.name.toLowerCase() === canonical!.toLowerCase(),
          )
        : undefined;

      if (target) {
        return {
          status: 'SUGGESTION',
          input: name,
          suggestion: { id: target.id, name: target.name },
          reason: reason || `Sepertinya yang Anda maksud "${target.name}".`,
          aiChecked: true,
        };
      }
    }

    const finalName = this.normalizeName(canonical || name);

    // Nama rapian dari AI bisa saja sudah ada di direktori ("backen" ->
    // "Backend Development" lewat jalur "new").
    const alreadyThere = await this.findByNameInsensitive(finalName);
    if (alreadyThere) {
      return {
        status: 'EXACT',
        category: alreadyThere,
        reason: reason || `${noun} ini sudah ada di direktori.`,
        aiChecked: true,
      };
    }

    const created = await this.createSkill(finalName);
    return {
      status: 'CREATED',
      category: { id: created.id, name: created.name },
      reason: reason || `${noun} baru ditambahkan ke direktori.`,
      aiChecked: true,
    };
  }

  /**
   * Menerjemahkan nama bidang menjadi baris direktori, membuatnya bila perlu.
   *
   * Dipakai jalur penyimpanan studi kasus, yang menerima nama dan bukan id agar
   * muatan API tetap terbaca dan sama bentuknya dengan `TalentProfile.skills`.
   * Nama kosong berarti lintas bidang dan disimpan sebagai null.
   */
  async resolveCategoryId(name?: string | null): Promise<string | null> {
    const trimmed = this.normalizeName(name ?? '');
    if (!trimmed) return null;

    // Jalur ini sengaja tidak memanggil AI — pemeriksaannya sudah dilakukan
    // `resolveCategory` saat perusahaan mengetiknya, dan mengulanginya di sini
    // berarti satu permintaan berbayar pada setiap penyimpanan draf. Batas
    // panjang tetap terjaga karena `createSkill` yang memeriksanya.
    const created = await this.createSkill(trimmed);
    return created.id;
  }
}
