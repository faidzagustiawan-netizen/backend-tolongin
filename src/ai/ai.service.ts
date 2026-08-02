import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PythonWorkerService } from './python-worker.service';

export interface EvaluationResult {
  aiScore: number;
  aiPlagiarismScore: number;
  aiCorrectionSummary: string;
  softSkillScore?: number | null;
  softSkillFeedback?: string | null;
  weaknessTags?: string[];
}

export interface ComponentEvaluation {
  componentId: string;
  score: number;
  aiFeedback: string;
}

export interface ComponentEvaluationResult extends EvaluationResult {
  components: ComponentEvaluation[];
}

export interface KycVerificationResult {
  isKtpValid: boolean;
  isMatch: boolean;
  confidenceScore: number;
  ktpNik: string | null;
  ktpName: string | null;
  reason: string;
  biometricHash?: string | null;
  /**
   * Embedding wajah hasil mesin DeepFace di sisi server. Dipakai pengawasan
   * berkelanjutan sebagai acuan pembanding saat ujian berlangsung.
   */
  featureVector?: number[] | null;
  /** Jarak cosine antara selfie dan foto KTP. Dicatat untuk kalibrasi ambang. */
  faceDistance?: number | null;
  /**
   * Cukup mirip untuk diloloskan, tetapi berada di zona yang belum meyakinkan
   * sehingga perlu diperiksa petugas.
   */
  needsReview?: boolean;
}

/**
 * Mesin biometrik tidak dapat dimuat (dependensi Python hilang atau rusak).
 *
 * Sengaja bertipe sendiri: kegagalan ini harus menghasilkan "coba lagi nanti",
 * bukan "wajah Anda tidak cocok dengan KTP". Menyamakan keduanya membuat
 * pengguna menanggung kesalahan konfigurasi server.
 */
export class FaceEngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FaceEngineUnavailableError';
  }
}

const DEFAULT_AI_BASE_URL = 'https://ai.sumopod.com/v1';
const DEFAULT_AI_MODEL = 'gpt-4o';

/**
 * Dua kosakata yang ditampung tabel `skills` yang sama.
 *
 * Menyatukan tabelnya membuat "Backend Development" yang dicari perusahaan
 * benar-benar baris yang sama dengan yang tercantum di profil kandidat. Tetapi
 * ukuran kelayakannya berbeda: "React" keahlian yang sah dan bukan bidang
 * pekerjaan, sedangkan "Akuntan" sebaliknya. Satu prompt untuk keduanya akan
 * menolak separuh masukan yang benar.
 */
export type DirectoryEntryKind = 'category' | 'skill';

const DIRECTORY_VOCABULARY: Record<
  DirectoryEntryKind,
  {
    noun: string;
    nounCapital: string;
    actor: string;
    audience: string;
    typoExample: string;
    newExample: string;
    extraRule: string;
  }
> = {
  category: {
    noun: 'bidang pekerjaan',
    nounCapital: 'Bidang pekerjaan',
    actor: 'Perusahaan',
    audience: 'perusahaan',
    typoExample: '"backen" atau "Back-end" untuk "Backend Development"',
    newExample: '"Video Editor", "Akuntan", "Data Engineer"',
    extraRule:
      '- Bidang pekerjaan adalah profesi atau fungsi kerja, bukan satu alat atau teknologi tunggal. "React" bukan bidang pekerjaan; "Frontend Development" adalah.\n',
  },
  skill: {
    noun: 'keahlian',
    nounCapital: 'Keahlian',
    actor: 'Talenta',
    audience: 'talenta',
    typoExample: '"reactt" atau "React.js" untuk "React"',
    newExample: '"Kubernetes", "Copywriting", "Negosiasi", "Adobe Illustrator"',
    extraRule:
      '- Keahlian boleh berupa teknologi, alat, metode, maupun kemampuan lunak — "React", "Figma", "Negosiasi", dan "Manajemen Waktu" semuanya sah. Nama profesi seperti "Backend Developer" bukan keahlian; yang sah adalah kemampuannya.\n',
  },
};

@Injectable()
export class AiService {
  private openai: OpenAI | null = null;
  private readonly model: string;
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly pythonWorker: PythonWorkerService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const baseURL =
      this.configService.get<string>('AI_BASE_URL') || DEFAULT_AI_BASE_URL;
    this.model = this.configService.get<string>('AI_MODEL') || DEFAULT_AI_MODEL;

    if (apiKey && apiKey.trim() !== '' && !apiKey.startsWith('sk-mock-')) {
      this.openai = new OpenAI({ apiKey, baseURL });
      this.logger.log(
        `Klien AI Sumopod berhasil diinisialisasi (baseURL: ${baseURL}, model: ${this.model}).`,
      );
    } else {
      this.logger.warn(
        'OPENAI_API_KEY belum dikonfigurasi. Seluruh fitur AI akan menolak permintaan dan masuk antrean review manual.',
      );
    }
  }

  /**
   * Satu-satunya pintu keluar ke penyedia AI (Sumopod).
   * Mengembalikan objek JSON hasil parsing, atau melempar galat agar
   * pemanggil memutuskan sendiri apakah fallback aman untuk kasusnya.
   */
  private async chatJson<T = any>(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    context: string,
  ): Promise<T> {
    if (!this.openai) {
      throw new Error('AI_NOT_CONFIGURED');
    }

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`Respons AI kosong untuk ${context}`);
    }

    return JSON.parse(content) as T;
  }

  private async verifyWithPythonEngine(
    selfieUrl: string,
    ktpUrl: string,
    mode: 'full' | 'match_only' = 'full',
  ): Promise<KycVerificationResult> {
    // Jenis pembandingan menentukan ambang di sisi Python. Mode `full` adalah
    // pendaftaran identitas (selfie vs foto cetak pada KTP, ambang longgar);
    // `match_only` adalah pengecekan anti-joki yang membandingkan dua foto
    // digital, sehingga harus dinilai dengan ambang foto-vs-foto yang ketat.
    const comparison = mode === 'full' ? 'selfie_vs_ktp' : 'selfie_vs_selfie';

    // Dijalankan di pool proses Python yang tetap hidup. Versi sebelumnya
    // memanggil `exec` per permintaan, sehingga TensorFlow dan bobot model
    // dimuat ulang setiap kali — beberapa detik yang dibayar berulang pada
    // jalur yang dipanggil tiap 30 detik per kandidat.
    try {
      this.logger.log('Starting Phase 1: Biometric Face Match (TensorFlow)');
      const faceResult = await this.pythonWorker.call<any>('verify_face', {
        selfiePhotoUrl: selfieUrl,
        idCardPhotoUrl: ktpUrl,
        comparison,
      });

      if (!faceResult.isMatch) {
        return {
          isKtpValid: false,
          isMatch: false,
          confidenceScore: faceResult.confidenceScore || 0,
          ktpNik: null,
          ktpName: null,
          reason: faceResult.reason || 'Wajah tidak cocok.',
          biometricHash: faceResult.biometricHash,
          faceDistance: faceResult.faceDistance ?? null,
        };
      }

      if (mode !== 'full') {
        return {
          isKtpValid: true,
          isMatch: true,
          confidenceScore: faceResult.confidenceScore,
          ktpNik: 'MATCH_ONLY_MODE',
          ktpName: 'MATCH_ONLY_MODE',
          reason: faceResult.reason,
          biometricHash: faceResult.biometricHash,
          faceDistance: faceResult.faceDistance ?? null,
          needsReview: !!faceResult.needsReview,
        };
      }

      this.logger.log('Starting Phase 2: KTP OCR (PyTorch)');
      const ktpResult = await this.pythonWorker.call<any>('verify_ktp', {
        idCardPhotoUrl: ktpUrl,
      });

      return {
        isKtpValid: ktpResult.isKtpValid,
        isMatch: true,
        confidenceScore: faceResult.confidenceScore,
        ktpNik: ktpResult.ktpNik,
        ktpName: ktpResult.ktpName,
        reason: ktpResult.isKtpValid
          ? 'Validasi Identitas KTP & Biometrik Wajah sukses terverifikasi.'
          : ktpResult.reason,
        biometricHash: faceResult.biometricHash,
        featureVector: faceResult.featureVector ?? null,
        faceDistance: faceResult.faceDistance ?? null,
        needsReview: !!faceResult.needsReview,
      };
    } catch (e: any) {
      this.logger.error('Python Engine Error: ' + e.message);

      // Mesin yang tidak bisa dimuat adalah gangguan infrastruktur, bukan
      // jawaban tentang identitas pengguna. Dilempar ke atas supaya alur
      // verifikasi tidak menandai KTP pengguna sebagai gagal karena
      // dependensi server yang belum lengkap.
      if (String(e?.message).includes('ENGINE_UNAVAILABLE')) {
        throw new FaceEngineUnavailableError(e.message);
      }

      return {
        isKtpValid: false,
        isMatch: false,
        confidenceScore: 0,
        ktpNik: null,
        ktpName: null,
        reason: 'Sistem deteksi biometrik Python gagal memproses gambar.',
        biometricHash: null,
      };
    }
  }

  async evaluateHolistic(
    challengeTitle: string,
    challengeCategory: string,
    repositoryUrl?: string,
    notes?: string,
    gradingRubric?: Record<string, number>,
    candidateAnswers?: string,
  ): Promise<EvaluationResult> {
    const prompt = `Anda adalah AI Evaluator Senior untuk platform Tolongin.co. Evaluasi penyerahan solusi studi kasus berikut:
Judul Studi Kasus: "${challengeTitle}"
Kategori: "${challengeCategory}"
Repositori: "${repositoryUrl || 'Tidak disediakan'}"
Catatan Tambahan: "${notes || 'Tidak disediakan'}"
Kompilasi Jawaban Kandidat (Essay/Pilihan Ganda/Live Coding):
${candidateAnswers || 'Tidak ada jawaban komponen soal yang dikirim'}

Kriteria dan Bobot Penilaian (Rubrik):
${gradingRubric ? JSON.stringify(gradingRubric, null, 2) : 'Gunakan penilaian objektif standar.'}

Instruksi Penilaian:
1. Baca dan analisis repositori serta seluruh jawaban kandidat dengan saksama.
2. Jika ada Rubrik Penilaian, WAJIB hitung nilai akhir murni berdasarkan bobot masing-masing kriteria secara matematis (Total nilai keseluruhan maksimal 100). Jangan berikan nilai acak.
3. Berikan rekomendasi teknis yang relevan.

Berikan penilaian akhir berupa objek JSON dengan struktur persis berikut:
{
  "aiScore": <angka 0-100 (sesuai perhitungan bobot rubrik)>,
  "aiPlagiarismScore": <persentase 0-100, misal 0.5 jika sangat orisinal>,
  "aiCorrectionSummary": "<analisis singkat dan rekomendasi perbaikan struktur, keamanan, dan standar>"
}`;

    try {
      const resultJson = await this.chatJson(
        [{ role: 'system', content: prompt }],
        `evaluasi holistik "${challengeTitle}"`,
      );

      this.logger.log(
        `Berhasil mengevaluasi studi kasus "${challengeTitle}" via Sumopod (${this.model}).`,
      );

      return {
        aiScore: resultJson.aiScore ?? 0,
        aiPlagiarismScore: resultJson.aiPlagiarismScore ?? 0.0,
        aiCorrectionSummary:
          resultJson.aiCorrectionSummary || 'Evaluasi AI berhasil dilakukan.',
      };
    } catch (error: any) {
      // Nilai acak/mock tidak boleh masuk ke rapor kandidat. Lempar galat agar
      // pemanggil menandai submission untuk review manual.
      this.logger.error(
        `Evaluasi holistik gagal untuk "${challengeTitle}": ${error.message}. Diteruskan ke review manual.`,
      );
      throw new Error('AI_EVALUATION_FAILED');
    }
  }

  async evaluateComponents(
    challengeTitle: string,
    challengeCategory: string,
    componentsData: {
      id: string;
      question: string;
      maxPoints: number;
      candidateAnswer: string;
      skillCategory?: string;
    }[],
    gradingRubric?: Record<string, number>,
  ): Promise<ComponentEvaluationResult> {
    const prompt = `Anda adalah AI Evaluator Senior untuk platform Tolongin.co. Evaluasi penyerahan solusi studi kasus multi-tahap berikut:
Judul Studi Kasus: "${challengeTitle}"
Kategori: "${challengeCategory}"

Berikut adalah daftar tahapan/soal (komponen) dan jawaban dari kandidat:
${componentsData
  .map(
    (c) => `
---
ID Soal: ${c.id}
Kategori Skill: ${c.skillCategory || 'TECHNICAL'}
Poin Maksimal: ${c.maxPoints}
Soal: ${c.question}
Jawaban Kandidat: ${c.candidateAnswer}
`,
  )
  .join('\n')}

Kriteria dan Bobot Penilaian Kualitas Keseluruhan (Rubrik):
${gradingRubric ? JSON.stringify(gradingRubric, null, 2) : 'Gunakan penilaian objektif standar.'}

Instruksi Penilaian Mutlak:
1. Evaluasi setiap jawaban secara mandiri.
2. Berikan nilai per soal (score) 0 hingga Poin Maksimal, serta umpan balik teknis khusus untuk jawaban tersebut di dalam array "components".
3. Tentukan "aiScore" sebagai skor evaluasi untuk jawaban yang berfokus pada Hard Skill (Kategori Skill selain SOFT_SKILL). aiScore maksimal 100.
4. Tentukan "softSkillScore" sebagai evaluasi khusus untuk jawaban yang berfokus pada SOFT_SKILL (Kategori Skill: SOFT_SKILL). Jika tidak ada soal soft skill, kembalikan null. Maksimal 100.
5. Berikan "softSkillFeedback" berupa umpan balik kualitatif mengenai kepribadian, gaya komunikasi, atau penyelesaian konflik kandidat (jika ada soal soft skill).
6. Berdasarkan jawaban yang salah/kurang optimal, berikan maksimal 3 kata kunci keahlian yang menjadi kelemahan kandidat (weaknessTags). Contoh: ["React Hooks", "SEO On-Page"]. Jika sempurna, biarkan kosong [].

Berikan penilaian akhir berupa objek JSON dengan struktur persis berikut:
{
  "aiScore": <nilai numerik 0-100 untuk hard skill>,
  "softSkillScore": <nilai numerik 0-100 khusus penilaian kompetensi soft skill, jika tidak dinilai berikan null>,
  "softSkillFeedback": "<umpan balik kepribadian/manajerial, berikan null jika tidak ada evaluasi soft skill>",
  "aiPlagiarismScore": <persentase 0-100 plagiarisme>,
  "aiCorrectionSummary": "<analisis singkat teknis (hard skill)>",
  "weaknessTags": ["Tag 1", "Tag 2"],
  "components": [
    {
      "componentId": "<ID Soal (sama persis dengan ID Soal di atas)>",
      "score": <angka nilai yang diberikan>,
      "aiFeedback": "<umpan balik teknis khusus untuk jawaban soal ini>"
    }
  ]
}`;

    try {
      const resultJson = await this.chatJson(
        [{ role: 'system', content: prompt }],
        `evaluasi komponen "${challengeTitle}"`,
      );

      this.logger.log(
        `Berhasil mengevaluasi studi kasus komponen "${challengeTitle}" via Sumopod (${this.model}).`,
      );

      return {
        aiScore: resultJson.aiScore || 0,
        softSkillScore: resultJson.softSkillScore ?? null,
        softSkillFeedback: resultJson.softSkillFeedback ?? null,
        aiPlagiarismScore: resultJson.aiPlagiarismScore || 0.0,
        aiCorrectionSummary:
          resultJson.aiCorrectionSummary || 'Evaluasi komponen selesai.',
        weaknessTags: resultJson.weaknessTags || [],
        components: resultJson.components || [],
      };
    } catch (error: any) {
      // Fallback deterministik sengaja tidak disediakan: data mock tidak boleh
      // menjadi nilai kandidat. Paksa masuk antrean review manual.
      this.logger.error(
        `Evaluasi komponen gagal untuk "${challengeTitle}": ${error.message}. Diteruskan ke review manual.`,
      );
      throw new Error('AI_EVALUATION_FAILED');
    }
  }

  /**
   * Memutuskan apakah teks yang diketik pengguna adalah salah ketik dari entri
   * direktori yang sudah ada, entri baru yang sah, atau bukan entri sama sekali.
   *
   * Jarak Levenshtein saja tidak cukup memutuskan ini. "Backen" berjarak 2 dari
   * "Backend Development" dan jelas salah ketik; "Data Engineer" juga berjarak
   * kecil dari "Data Science / ML" tetapi merupakan profesi yang berbeda.
   * Ambang berapa pun akan salah pada salah satu dari keduanya, jadi kandidat
   * terdekat diserahkan ke model bersama teks aslinya.
   *
   * `kind` menentukan kosakata mana yang sedang dinilai. Satu tabel `skills`
   * memuat dua hal sekaligus — bidang pekerjaan yang dicari perusahaan dan
   * keahlian yang dicantumkan talenta — dan keduanya tidak bisa dinilai dengan
   * ukuran yang sama: "React" adalah keahlian yang sah tetapi bukan bidang
   * pekerjaan, jadi prompt bidang akan menolaknya sebagai `invalid`.
   *
   * Melempar bila AI tidak tersedia — pemanggil yang memutuskan apakah aman
   * menerima masukan apa adanya.
   */
  async resolveDirectoryEntry(
    input: string,
    candidates: string[],
    kind: DirectoryEntryKind = 'category',
  ): Promise<{
    verdict: 'typo' | 'new' | 'invalid';
    canonical: string | null;
    reason: string;
  }> {
    const v = DIRECTORY_VOCABULARY[kind];

    const prompt = `Anda adalah kurator direktori ${v.noun} pada platform rekrutmen Indonesia.

${v.actor} mengetik ${v.noun}: "${input}"

${v.nounCapital} yang sudah ada di direktori dan paling mirip dengan ketikan itu:
${candidates.length > 0 ? candidates.map((c) => `- ${c}`).join('\n') : '(tidak ada yang mirip)'}

Tentukan satu dari tiga putusan:
- "typo": ketikan itu jelas maksudnya salah satu entri yang SUDAH ADA di daftar (salah eja, disingkat, beda bahasa, beda huruf besar-kecil). Contoh: ${v.typoExample}.
- "new": ketikan itu ${v.noun} yang sah tetapi memang BELUM ada di daftar. Contoh: ${v.newExample}. Hal yang berbeda tetap "new" walaupun ejaannya mirip dengan yang sudah ada.
- "invalid": ketikan itu bukan ${v.noun} (huruf acak, kata kasar, kalimat, nama orang, nama perusahaan).

Aturan:
- Jangan memaksakan "typo" hanya karena ejaannya berdekatan. Hal yang berbeda tetap "new".
- Untuk "typo", "canonical" WAJIB persis sama dengan salah satu baris daftar di atas.
- Untuk "new", "canonical" adalah ketikan yang dirapikan sebagai nama yang pantas ditampilkan (Kapital Di Awal Kata, tanpa tanda baca berlebih, tanpa tingkat senioritas seperti "Senior"/"Junior", bentuk tunggal). Pertahankan penulisan baku yang sudah dikenal luas, misalnya "Node.js" dan "UI/UX".
- Untuk "invalid", "canonical" adalah null.
- "reason" ditulis dalam Bahasa Indonesia, satu kalimat, ditujukan kepada ${v.audience}.
${v.extraRule}
Berikan respons HANYA dalam format JSON:
{ "verdict": "typo" | "new" | "invalid", "canonical": "string atau null", "reason": "satu kalimat" }`;

    const result = await this.chatJson<{
      verdict?: string;
      canonical?: string | null;
      reason?: string;
    }>([{ role: 'system', content: prompt }], `resolve ${kind}`);

    const verdict =
      result.verdict === 'typo' ||
      result.verdict === 'new' ||
      result.verdict === 'invalid'
        ? result.verdict
        : 'new';

    return {
      verdict,
      canonical:
        typeof result.canonical === 'string' && result.canonical.trim() !== ''
          ? result.canonical.trim()
          : null,
      reason:
        typeof result.reason === 'string' && result.reason.trim() !== ''
          ? result.reason.trim()
          : '',
    };
  }

  async generateChallengeBlueprint(
    promptStr: string,
    category: string,
    difficulty: string,
    companyName: string,
    previousBlueprint?: any,
  ): Promise<any> {
    const baseInstruction = previousBlueprint
      ? `Anda adalah AI Technical Recruiter Senior. Pengguna (user) ingin MEREVISI blueprint kerangka studi kasus yang sudah ada. Berikan Blueprint baru berdasarkan masukan berikut.\n\nBlueprint Sebelumnya:\n${JSON.stringify(previousBlueprint, null, 2)}\n\nMasukan Revisi (Prompt): "${promptStr}"`
      : `Anda adalah AI Technical Recruiter Senior. Buatlah KERANGKA (blueprint) studi kasus (challenge) rekrutmen IT berdasarkan kebutuhan berikut:\nPerusahaan: ${companyName}\nKategori Pekerjaan: ${category}\nTingkat Kesulitan: ${difficulty}\nKebutuhan Khusus / Prompt: "${promptStr}"`;

    const prompt = `${baseInstruction}

Fokuslah pada skenario, objektif, dan silabus (tanpa membuat detail soal kodenya).
Lakukan penalaran (Chain-of-Thought) terlebih dahulu. Pikirkan secara mendalam tentang skenario bisnis, kesulitan, dan apa saja yang diuji sebelum merancang struktur blueprint.
PENTING: Seluruh teks (title, summary, description, sections_outline, reasoning, dll) WAJIB dalam Bahasa Indonesia.
PENTING: Deskripsi setiap 'sections_outline' WAJIB detail (3-5 kalimat) menjelaskan tugas kandidat dan metrik tahap tersebut.
PENTING: Jika prompt mengimplikasikan adanya data eksternal (dataset, dokumentasi, UI design) masukkan ke dalam array 'requiredAssets'.

Berikan respons HANYA dalam format JSON persis dengan struktur ini:
{
  "reasoning": "Analisis mendalam mengapa blueprint ini dirancang seperti ini dan bagaimana ini menguji kompetensi yang relevan dengan perusahaan/masukan.",
  "requiredAssets": ["URL Dataset Aktivitas", "Dokumentasi API"],
  "title": "Judul studi kasus yang menarik dan profesional (maks 60 karakter)",
  "summary": "Ringkasan singkat tentang tantangan ini (maks 150 karakter)",
  "description": "Deskripsi rinci skenario bisnis dan konteks permasalahan (minimal 3 paragraf).",
  "rubric": {
    "kriteria_1": 40,
    "kriteria_2": 30,
    "kriteria_3": 30
  },
  "sections_outline": [
    {
      "title": "Tahap 1: Analisis",
      "description": "Deskripsi yang SANGAT DETAIL (3-5 kalimat). Jelaskan persis apa yang harus dilakukan kandidat, tools apa yang akan diuji, dan hasil akhirnya.",
      "competencies": ["Sistem Arsitektur", "Database Design"]
    }
  ]
}`;

    try {
      const resultJson = await this.chatJson(
        [{ role: 'system', content: prompt }],
        'generate blueprint',
      );
      this.logger.log('Berhasil men-generate blueprint via Sumopod.');
      return resultJson;
    } catch (error: any) {
      this.logger.error('Generate blueprint gagal: ' + error.message);

      // Sebelumnya kegagalan dijawab dengan kerangka kosong berisi
      // "Draft: <kategori>". Klien menerimanya sebagai 201 dan menampilkan
      // "Blueprint berhasil dibuat", sehingga pengguna tidak punya cara tahu
      // AI sedang mati — dan untuk talenta, langkah berikutnya memotong token
      // demi mengembangkan kerangka kosong itu.
      throw new ServiceUnavailableException(
        'Layanan AI sedang tidak dapat dihubungi. Silakan coba lagi beberapa saat lagi, atau susun studi kasus lewat mode manual.',
      );
    }
  }

  async generateChallengeContent(
    blueprint: any,
    difficulty?: string,
  ): Promise<{
    title: string;
    summary: string;
    description: string;
    rubric: Record<string, number>;
    startsAt?: string;
    deadlineAt?: string;
    sections: any[];
  }> {
    const difficultyInstruction =
      difficulty === 'ADVANCED'
        ? 'Level: ADVANCED. Buat soal SANGAT SULIT SEKALI, menguji edge-cases ekstrem, optimasi kompleks, dan problem-solving tingkat arsitek senior.'
        : difficulty === 'INTERMEDIATE'
          ? 'Level: INTERMEDIATE. Buat soal dengan kesulitan menengah, menguji best-practice dan integrasi tingkat menengah.'
          : 'Level: BEGINNER. Buat soal yang fundamental namun praktikal.';

    const prompt = `Anda adalah AI Technical Assessor Master. Anda diberikan sebuah blueprint kerangka studi kasus rekrutmen. Tugas Anda adalah mengembangkan blueprint tersebut menjadi sekumpulan soal teknis (components) yang SANGAT KOMPREHENSIF dan MENDALAM.

PENTING: Seluruh teks (title, summary, description, sections_outline, reasoning, dll) WAJIB dalam Bahasa Indonesia.

${difficultyInstruction}

Blueprint Awal:
${JSON.stringify(blueprint, null, 2)}

INSTRUKSI WAJIB:
1. PENTING: Kembangkan "sections_outline" dari blueprint menjadi "sections" yang berisi daftar pertanyaan aktual ("components").
2. Lakukan penalaran (Chain-of-Thought) terlebih dahulu. Analisis objektif dari section tersebut, lalu tentukan tipe soal apa yang PALING RELEVAN dan MENDALAM.
3. Anda BEBAS memilih tipe soal (ESSAY, MULTIPLE_CHOICE, LIVE_CODING, FILE_UPLOAD, VIDEO_UPLOAD, URL_SUBMISSION) secara organik sesuai dengan skenario. JANGAN PERNAH memberikan array components yang kosong.
4. PENTING TENTANG LIVE_CODING vs MACHINE LEARNING: Fitur LIVE_CODING hanya untuk algoritma dasar satu file. Jika tantangannya melibatkan Machine Learning, Jupyter Notebook, Dataset CSV, atau library berat (XGBoost, Scikit-Learn, dll), JANGAN gunakan LIVE_CODING. Wajib gunakan FILE_UPLOAD (upload .ipynb) atau URL_SUBMISSION (link Google Colab/Github).
5. Jika menggunakan MULTIPLE_CHOICE, sediakan array 'options' yang berisi objek jawaban: [{ "id": "A", "text": "opsi 1", "isCorrect": false }, ...]. Pastikan salah satu bernilai true.
6. Jika menggunakan LIVE_CODING, WAJIB isi property 'language' (contoh: "python", "javascript") dan 'starterCode' (kode awal).
7. WAJIB lengkapi atau buat "rubric" (Kriteria dan Bobot Penilaian) secara proporsional.
8. Total points dari seluruh components HARUS relevan dengan skala penilaian.

Berikan respons HANYA dalam format JSON dengan struktur ini (tanpa markdown blok):
{
  "reasoning": "Analisis mendalam mengapa soal-soal ini dibuat, mengapa tipe komponen ini dipilih, dan bagaimana ini secara efektif menguji kompetensi sesuai blueprint.",
  "title": "Judul dari blueprint",
  "summary": "Ringkasan dari blueprint",
  "description": "Deskripsi dari blueprint (Markdown dibolehkan)",
  "rubric": {
    "Kriteria 1": 40,
    "Kriteria 2": 60
  },
  "sections": [
    {
      "title": "Nama Tahap",
      "description": "Deskripsi tahap",
      "components": [
        {
          "type": "ESSAY",
          "question": "Pertanyaan yang sangat mendalam terkait skenario...",
          "points": 50
        },
        {
          "type": "MULTIPLE_CHOICE",
          "question": "Pertanyaan pilihan ganda...",
          "points": 10,
          "options": [
            { "id": "A", "text": "Jawaban A", "isCorrect": true },
            { "id": "B", "text": "Jawaban B", "isCorrect": false }
          ]
        },
        {
          "type": "LIVE_CODING",
          "question": "Buat fungsi XYZ",
          "points": 30,
          "language": "python",
          "starterCode": "def xyz():\\n  pass"
        }
      ]
    }
  ]
}`;

    try {
      const resultJson = await this.chatJson(
        [{ role: 'system', content: prompt }],
        'generate challenge content',
      );
      this.logger.log('Berhasil men-generate challenge via Sumopod.');
      return resultJson;
    } catch (error: any) {
      this.logger.error('Generate challenge gagal: ' + error.message);

      // Kerangka satu-soal "kirim tautan GitHub" dulu dikembalikan di sini
      // seolah-olah hasil AI. Draf tetap ditandai selesai, token talenta tetap
      // terpotong, dan tidak ada yang menandakan generasi sebenarnya gagal.
      // Pemanggil di latar belakang kini menangkap galat ini, memberi tahu
      // pengguna, dan mengembalikan tokennya.
      throw new ServiceUnavailableException(
        'Layanan AI sedang tidak dapat dihubungi saat menyusun soal.',
      );
    }
  }

  /**
   * Mencocokkan dua foto wajah digital (kamera langsung vs selfie tersimpan).
   *
   * Dinilai dengan ambang foto-vs-foto yang ketat, bukan ambang longgar milik
   * pasangan selfie-vs-KTP: pelonggaran itu hanya sah untuk foto cetak pada
   * kartu, dan memakainya di sini meloloskan orang yang berbeda.
   */
  async verifyFaceMatch(
    photo1Url: string,
    photo2Url: string,
  ): Promise<{
    isMatch: boolean;
    confidenceScore: number;
    reason: string;
    faceDistance: number | null;
  }> {
    this.logger.log(
      'Mencocokkan wajah secara lokal menggunakan DeepFace ML...',
    );
    const pythonRes = await this.verifyWithPythonEngine(
      photo1Url,
      photo2Url,
      'match_only',
    );
    return {
      isMatch: pythonRes.isMatch,
      confidenceScore: pythonRes.confidenceScore,
      reason: pythonRes.reason,
      faceDistance: pythonRes.faceDistance ?? null,
    };
  }

  async verifyKtpAndSelfie(
    selfieUrl: string,
    ktpUrl: string,
  ): Promise<KycVerificationResult | null> {
    // 1. Prioritas Utama: Verifikasi menggunakan DeepFace & EasyOCR (Python Engine)
    try {
      this.logger.log(
        'Menjalankan verifikasi identitas menggunakan DeepFace ML & EasyOCR (Python Engine)...',
      );
      const pythonRes = await this.verifyWithPythonEngine(
        selfieUrl,
        ktpUrl,
        'full',
      );
      if (
        pythonRes &&
        !pythonRes.reason.includes('Fatal Python Error') &&
        !pythonRes.reason.includes('Python gagal memproses')
      ) {
        return pythonRes;
      }
    } catch (_err: any) {
      this.logger.warn(
        'Python verification engine mengalami galat eksekusi, beralih ke AI Vision Sumopod...',
      );
    }

    const prompt = `Anda adalah Petugas KYC Verifikasi Identitas Resmi untuk platform rekrutmen Tolongin.co di Indonesia.
Diberikan dua gambar:
1. Foto KTP / Dokumen Identitas.
2. Foto Selfie Wajah Kandidat secara langsung.

Tugas Anda adalah melakukan verifikasi dengan ketat dan teliti:
1. Periksa apakah Gambar 1 benar-benar merupakan KTP resmi Indonesia (harus memuat ciri khas tulisan seperti "PROVINSI", "NIK", "Nama", atau format KTP WNI standar). Jika dokumen bukan KTP resmi (misal: kartu nama, foto keyboard, foto pemandangan, atau dokumen palsu), nyatakan tidak valid dengan alasan spesifik.
2. Bandingkan anatomi wajah yang ada pada KTP (Gambar 1) dengan foto selfie langsung (Gambar 2). Apakah kedua wajah tersebut adalah orang yang sama? Periksa struktur mata, hidung, dan rahang.
3. Deteksi apakah ada indikasi pemalsuan, foto dari layar (spoofing), atau gambar buram/terpotong.

Berikan hasil akhir dalam format JSON persis dengan struktur berikut:
{
  "isKtpValid": boolean,
  "isMatch": boolean,
  "confidenceScore": number (0-100),
  "ktpNik": string atau null (jika terbaca, harus 16 digit),
  "ktpName": string atau null (jika terbaca),
  "reason": "Penjelasan spesifik dalam bahasa Indonesia, misal: KTP terverifikasi asli dari Republik Indonesia dan wajah pada selfie 96% cocok dengan foto di KTP."
}`;

    // 2. Cadangan: AI Vision via Sumopod
    try {
      const resultJson = await this.chatJson(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: ktpUrl } },
              { type: 'image_url', image_url: { url: selfieUrl } },
            ],
          },
        ],
        'verifikasi KYC',
      );

      this.logger.log(
        `Berhasil memverifikasi dokumen KYC via Sumopod (${this.model}).`,
      );

      return {
        isKtpValid: resultJson.isKtpValid ?? false,
        isMatch: resultJson.isMatch ?? false,
        confidenceScore: resultJson.confidenceScore ?? 0,
        ktpNik: resultJson.ktpNik ?? null,
        ktpName: resultJson.ktpName ?? null,
        reason: resultJson.reason ?? 'Pemeriksaan AI Vision selesai.',
      };
    } catch (error: any) {
      this.logger.error(
        'Gagal memverifikasi KYC dengan AI Vision Sumopod: ' + error.message,
      );
    }

    // 3. Jika semua engine (Python & Sumopod) gagal atau menolak verifikasi
    this.logger.warn(
      'Semua layanan verifikasi (DeepFace, EasyOCR, AI Vision Sumopod) gagal memverifikasi KTP atau Liveness.',
    );
    return {
      isKtpValid: false,
      isMatch: false,
      confidenceScore: 0,
      ktpNik: null,
      ktpName: null,
      reason:
        'Sistem keamanan gagal mendeteksi KTP asli atau kecocokan wajah pada dokumen yang diunggah. Harap unggah foto KTP beresolusi tinggi dan selfie di ruangan dengan pencahayaan terang.',
    };
  }
}
