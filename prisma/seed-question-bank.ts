/**
 * Isi awal bank soal platform.
 *
 * Sengaja tidak hanya keahlian teknis IT. Soal dengan `category: null` berlaku
 * lintas bidang — soft skill, wawancara, dan etika kerja tidak dimiliki satu
 * kategori pekerjaan pun, dan justru itulah yang paling luas dipakai. Penyaring
 * kategori di QuestionBankService selalu menyertakannya.
 *
 * Idempoten: soal yang pertanyaannya sudah ada di bank platform dilewati, jadi
 * skrip ini aman dijalankan ulang setelah daftarnya ditambah.
 *
 * Jalankan: npx ts-node prisma/seed-question-bank.ts
 */
import {
  PrismaClient,
  Prisma,
  ChallengeCategory,
  ChallengeDifficulty,
  ComponentType,
} from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type SeedItem = {
  type: ComponentType;
  question: string;
  description?: string;
  options?: { id: string; text: string; isCorrect: boolean }[];
  metadata?: Record<string, unknown>;
  defaultPoints: number;
  /** null = berlaku lintas bidang. */
  category: ChallengeCategory | null;
  difficulty: ChallengeDifficulty;
  skills: string[];
};

const ITEMS: SeedItem[] = [
  // ==========================================================
  // LINTAS BIDANG — soft skill, wawancara, etika kerja
  // ==========================================================
  {
    type: ComponentType.MULTIPLE_CHOICE,
    question:
      'Dua tugas yang sama-sama disebut prioritas utama jatuh tempo di hari yang sama, dan Anda hanya sempat menyelesaikan satu. Apa langkah pertama Anda?',
    description:
      'Menguji cara kandidat menangani prioritas yang bertabrakan tanpa menghilang atau memutuskan sendiri diam-diam.',
    options: [
      {
        id: 'a',
        text: 'Kerjakan yang paling cepat selesai lebih dulu supaya ada yang tuntas',
        isCorrect: false,
      },
      {
        id: 'b',
        text: 'Sampaikan tabrakannya kepada kedua pemangku kepentingan beserta dampak tiap pilihan, lalu minta keputusan prioritas',
        isCorrect: true,
      },
      {
        id: 'c',
        text: 'Kerjakan keduanya setengah jadi agar tidak ada yang merasa ditinggalkan',
        isCorrect: false,
      },
      {
        id: 'd',
        text: 'Lembur sampai keduanya selesai tanpa memberi tahu siapa pun',
        isCorrect: false,
      },
    ],
    defaultPoints: 10,
    category: null,
    difficulty: ChallengeDifficulty.BEGINNER,
    skills: ['Manajemen Waktu', 'Komunikasi', 'Prioritisasi'],
  },
  {
    type: ComponentType.MULTIPLE_CHOICE,
    question:
      'Anda menunggu jawaban rekan tim untuk melanjutkan pekerjaan, tetapi pesan Anda tidak dibalas selama dua hari dan tenggat tinggal besok. Apa yang Anda lakukan?',
    options: [
      {
        id: 'a',
        text: 'Terus menunggu; pekerjaan itu memang tanggung jawab dia',
        isCorrect: false,
      },
      {
        id: 'b',
        text: 'Laporkan ke atasannya bahwa rekan tersebut menghambat pekerjaan',
        isCorrect: false,
      },
      {
        id: 'c',
        text: 'Hubungi lewat kanal lain sambil menyiapkan rencana cadangan, dan beri tahu lebih awal bila tenggat berisiko meleset',
        isCorrect: true,
      },
      {
        id: 'd',
        text: 'Ambil alih bagiannya tanpa memberi tahu siapa pun',
        isCorrect: false,
      },
    ],
    defaultPoints: 10,
    category: null,
    difficulty: ChallengeDifficulty.BEGINNER,
    skills: ['Kerja Sama Tim', 'Komunikasi', 'Inisiatif'],
  },
  {
    type: ComponentType.MULTIPLE_CHOICE,
    question:
      'Saat mengerjakan tugas, Anda tidak sengaja menemukan berkas berisi data pribadi pelanggan yang bisa diakses siapa saja di dalam perusahaan. Apa tindakan yang tepat?',
    description: 'Menguji kepekaan terhadap kerahasiaan data dan etika kerja.',
    options: [
      {
        id: 'a',
        text: 'Laporkan segera ke penanggung jawab keamanan atau atasan, dan jangan menyalin maupun menyebarkan isinya',
        isCorrect: true,
      },
      {
        id: 'b',
        text: 'Abaikan saja karena bukan bagian dari tugas Anda',
        isCorrect: false,
      },
      {
        id: 'c',
        text: 'Simpan salinannya sebagai bukti sebelum melapor',
        isCorrect: false,
      },
      {
        id: 'd',
        text: 'Bagikan ke grup tim agar semua orang ikut waspada',
        isCorrect: false,
      },
    ],
    defaultPoints: 15,
    category: null,
    difficulty: ChallengeDifficulty.INTERMEDIATE,
    skills: ['Etika Kerja', 'Kesadaran Keamanan'],
  },
  {
    type: ComponentType.ESSAY,
    question:
      'Ceritakan satu perselisihan kerja yang pernah Anda alami dengan rekan tim. Apa situasinya, apa peran Anda, apa yang Anda lakukan, dan bagaimana akhirnya?',
    description:
      'Gunakan urutan Situasi–Tugas–Aksi–Hasil. Ceritakan kejadian nyata, termasuk bagian yang tidak berjalan mulus. Sekitar 250–400 kata.',
    metadata: { minWords: 250, maxWords: 400, framework: 'STAR' },
    defaultPoints: 20,
    category: null,
    difficulty: ChallengeDifficulty.INTERMEDIATE,
    skills: ['Kerja Sama Tim', 'Komunikasi', 'Resolusi Konflik'],
  },
  {
    type: ComponentType.ESSAY,
    question:
      'Ceritakan saat Anda menerima kritik keras atas hasil kerja Anda. Apa isi kritiknya, bagaimana tanggapan Anda saat itu, dan apa yang berubah setelahnya?',
    metadata: { minWords: 200, maxWords: 350 },
    defaultPoints: 20,
    category: null,
    difficulty: ChallengeDifficulty.INTERMEDIATE,
    skills: ['Adaptabilitas', 'Kesadaran Diri'],
  },
  {
    type: ComponentType.ESSAY,
    question:
      'Jelaskan satu hal rumit yang Anda kuasai kepada orang yang sama sekali tidak punya latar belakang di bidang itu. Tulis penjelasannya langsung, bukan deskripsi cara Anda menjelaskan.',
    description:
      'Menguji kemampuan menyederhanakan tanpa menyesatkan — dipakai lintas peran, dari teknisi sampai pemasar.',
    metadata: { minWords: 200, maxWords: 400 },
    defaultPoints: 20,
    category: null,
    difficulty: ChallengeDifficulty.INTERMEDIATE,
    skills: ['Komunikasi', 'Pemecahan Masalah'],
  },
  {
    type: ComponentType.VIDEO_UPLOAD,
    question:
      'Rekam perkenalan diri maksimal 2 menit: siapa Anda, pengalaman yang paling relevan dengan posisi ini, dan alasan Anda melamar.',
    description:
      'Direkam sekali jalan, tanpa penyuntingan. Yang dinilai kejelasan dan kepercayaan diri, bukan kualitas kamera.',
    metadata: { maxDurationMinutes: 2, allowRetake: true },
    defaultPoints: 15,
    category: null,
    difficulty: ChallengeDifficulty.BEGINNER,
    skills: ['Komunikasi', 'Presentasi'],
  },
  {
    type: ComponentType.VIDEO_UPLOAD,
    question:
      'Rekam maksimal 3 menit: ceritakan satu keputusan sulit yang pernah Anda ambil, pertimbangan yang Anda timbang, dan apa yang akan Anda lakukan berbeda sekarang.',
    metadata: { maxDurationMinutes: 3, allowRetake: true },
    defaultPoints: 20,
    category: null,
    difficulty: ChallengeDifficulty.ADVANCED,
    skills: ['Pengambilan Keputusan', 'Kepemimpinan', 'Presentasi'],
  },
  {
    type: ComponentType.FILE_UPLOAD,
    question:
      'Susun rencana 30 hari pertama Anda di posisi ini: apa yang akan Anda pelajari, siapa yang akan Anda temui, dan hasil apa yang bisa dilihat di akhir bulan pertama.',
    description: 'Kirim dalam PDF, maksimal 2 halaman.',
    metadata: { acceptedFormats: ['pdf'], maxPages: 2, maxFileSizeMb: 5 },
    defaultPoints: 25,
    category: null,
    difficulty: ChallengeDifficulty.ADVANCED,
    skills: ['Perencanaan', 'Inisiatif', 'Prioritisasi'],
  },
  {
    type: ComponentType.URL_SUBMISSION,
    question:
      'Kirimkan tautan satu karya yang paling Anda banggakan, lalu jelaskan dalam kolom keterangan: apa peran Anda di dalamnya dan bagian mana yang benar-benar Anda kerjakan sendiri.',
    metadata: {
      placeholder: 'https://',
      requireDescription: true,
    },
    defaultPoints: 15,
    category: null,
    difficulty: ChallengeDifficulty.BEGINNER,
    skills: ['Portofolio', 'Komunikasi'],
  },

  // ==========================================================
  // BACKEND
  // ==========================================================
  {
    type: ComponentType.MULTIPLE_CHOICE,
    question:
      'Sebuah tabel pesanan berisi 50 juta baris. Kueri `WHERE status = ? AND created_at > ?` berjalan lambat. Indeks mana yang paling tepat?',
    options: [
      { id: 'a', text: 'Indeks terpisah pada status dan pada created_at', isCorrect: false },
      { id: 'b', text: 'Indeks gabungan (status, created_at)', isCorrect: true },
      { id: 'c', text: 'Indeks gabungan (created_at, status)', isCorrect: false },
      { id: 'd', text: 'Indeks unik pada id saja sudah cukup', isCorrect: false },
    ],
    defaultPoints: 15,
    category: ChallengeCategory.BACKEND,
    difficulty: ChallengeDifficulty.INTERMEDIATE,
    skills: ['Database', 'SQL', 'Optimasi Performa'],
  },
  {
    type: ComponentType.ESSAY,
    question:
      'Endpoint pembayaran Anda kadang dipanggil dua kali oleh klien yang mencoba ulang setelah timeout, dan pelanggan tertagih dua kali. Jelaskan cara membuat endpoint itu idempoten.',
    description:
      'Sebutkan mekanismenya secara konkret, termasuk apa yang disimpan, berapa lama, dan apa yang terjadi pada permintaan kedua.',
    metadata: { minWords: 250 },
    defaultPoints: 30,
    category: ChallengeCategory.BACKEND,
    difficulty: ChallengeDifficulty.ADVANCED,
    skills: ['API', 'Arsitektur Sistem', 'Database'],
  },
  {
    type: ComponentType.LIVE_CODING,
    question:
      'Implementasikan pembatas laju (rate limiter) yang mengizinkan maksimal N permintaan per pengguna dalam jendela waktu bergulir selama W detik.',
    description:
      'Jendela bergulir, bukan jendela tetap. Sertakan penanganan saat batas terlampaui.',
    metadata: {
      language: 'javascript',
      starterCode:
        'class RateLimiter {\n  constructor(limit, windowSeconds) {\n    // ...\n  }\n\n  /** @returns {boolean} true bila permintaan diizinkan */\n  allow(userId, now = Date.now()) {\n    // ...\n  }\n}\n\nmodule.exports = { RateLimiter };\n',
    },
    defaultPoints: 40,
    category: ChallengeCategory.BACKEND,
    difficulty: ChallengeDifficulty.ADVANCED,
    skills: ['Node.js', 'Algoritma', 'Arsitektur Sistem'],
  },
  {
    type: ComponentType.ESSAY,
    question:
      'Halaman daftar pesanan memanggil basis data 1 kali untuk mengambil 100 pesanan, lalu 100 kali lagi untuk mengambil nama pelanggan masing-masing. Jelaskan masalahnya dan dua cara memperbaikinya.',
    metadata: { minWords: 150 },
    defaultPoints: 20,
    category: ChallengeCategory.BACKEND,
    difficulty: ChallengeDifficulty.INTERMEDIATE,
    skills: ['Database', 'Optimasi Performa', 'API'],
  },

  // ==========================================================
  // FRONTEND
  // ==========================================================
  {
    type: ComponentType.MULTIPLE_CHOICE,
    question:
      'Sebuah komponen React ikut dirender ulang setiap kali induknya dirender, padahal propsnya terlihat sama. Penyebab paling mungkin?',
    options: [
      {
        id: 'a',
        text: 'Salah satu prop berupa objek atau fungsi yang dibuat baru di setiap render induk',
        isCorrect: true,
      },
      { id: 'b', text: 'Komponen tidak memakai useEffect', isCorrect: false },
      { id: 'c', text: 'State disimpan di komponen anak, bukan induk', isCorrect: false },
      { id: 'd', text: 'Komponen tidak diberi atribut key', isCorrect: false },
    ],
    defaultPoints: 15,
    category: ChallengeCategory.FRONTEND,
    difficulty: ChallengeDifficulty.INTERMEDIATE,
    skills: ['React', 'Optimasi Performa'],
  },
  {
    type: ComponentType.LIVE_CODING,
    question:
      'Buat hook `useDebounce(value, delay)` yang mengembalikan nilai terakhir setelah tidak ada perubahan selama `delay` milidetik.',
    description: 'Pastikan timer dibersihkan saat komponen dilepas.',
    metadata: {
      language: 'typescript',
      starterCode:
        "import { useState, useEffect } from 'react';\n\nexport function useDebounce<T>(value: T, delay: number): T {\n  // ...\n}\n",
    },
    defaultPoints: 30,
    category: ChallengeCategory.FRONTEND,
    difficulty: ChallengeDifficulty.INTERMEDIATE,
    skills: ['React', 'TypeScript'],
  },
  {
    type: ComponentType.ESSAY,
    question:
      'Sebuah formulir pendaftaran menampilkan pesan galat hanya dengan mengubah warna pinggiran kolom menjadi merah. Sebutkan masalah aksesibilitasnya dan cara memperbaikinya.',
    metadata: { minWords: 150 },
    defaultPoints: 20,
    category: ChallengeCategory.FRONTEND,
    difficulty: ChallengeDifficulty.INTERMEDIATE,
    skills: ['Aksesibilitas', 'HTML', 'UI Design'],
  },

  // ==========================================================
  // DATA SCIENCE
  // ==========================================================
  {
    type: ComponentType.MULTIPLE_CHOICE,
    question:
      'Model deteksi penipuan transaksi: hanya 0,3% transaksi yang benar-benar penipuan, dan biaya melewatkan penipuan jauh lebih besar daripada biaya memeriksa transaksi yang ternyata aman. Metrik mana yang paling penting dijaga?',
    options: [
      { id: 'a', text: 'Akurasi keseluruhan', isCorrect: false },
      { id: 'b', text: 'Recall pada kelas penipuan', isCorrect: true },
      { id: 'c', text: 'Precision pada kelas aman', isCorrect: false },
      { id: 'd', text: 'Kecepatan inferensi', isCorrect: false },
    ],
    defaultPoints: 15,
    category: ChallengeCategory.DATA_SCIENCE,
    difficulty: ChallengeDifficulty.INTERMEDIATE,
    skills: ['Machine Learning', 'Analisis Data'],
  },
  {
    type: ComponentType.ESSAY,
    question:
      'Model Anda mencapai akurasi 99% saat divalidasi, tetapi anjlok begitu dipakai sungguhan. Sebutkan tiga penyebab yang paling mungkin dan cara memastikan masing-masing.',
    metadata: { minWords: 250 },
    defaultPoints: 30,
    category: ChallengeCategory.DATA_SCIENCE,
    difficulty: ChallengeDifficulty.ADVANCED,
    skills: ['Machine Learning', 'Analisis Data', 'Pemecahan Masalah'],
  },
  {
    type: ComponentType.FILE_UPLOAD,
    question:
      'Dari berkas data pelanggan yang disediakan, temukan pola pelanggan yang berhenti berlangganan. Kirim notebook berisi analisis dan tiga rekomendasi yang bisa ditindaklanjuti.',
    description:
      'Yang dinilai bukan kerumitan modelnya, melainkan kejelasan alasan dan kegunaan rekomendasinya.',
    metadata: { acceptedFormats: ['ipynb', 'pdf'], maxFileSizeMb: 20 },
    defaultPoints: 40,
    category: ChallengeCategory.DATA_SCIENCE,
    difficulty: ChallengeDifficulty.ADVANCED,
    skills: ['Analisis Data', 'Python', 'Komunikasi'],
  },

  // ==========================================================
  // UI/UX
  // ==========================================================
  {
    type: ComponentType.FILE_UPLOAD,
    question:
      'Alur checkout kami ditinggalkan 60% pengguna di langkah pengisian alamat. Rancang ulang langkah tersebut dan jelaskan dasar tiap perubahan.',
    description: 'Kirim PDF berisi rancangan sebelum-sesudah beserta alasannya.',
    metadata: { acceptedFormats: ['pdf', 'fig'], maxFileSizeMb: 25 },
    defaultPoints: 40,
    category: ChallengeCategory.UI_UX,
    difficulty: ChallengeDifficulty.ADVANCED,
    skills: ['UI Design', 'Riset Pengguna', 'Pemecahan Masalah'],
  },
  {
    type: ComponentType.ESSAY,
    question:
      'Anda diminta memperbaiki sebuah fitur tanpa anggaran riset dan tanpa akses langsung ke pengguna. Bagaimana Anda tetap mengambil keputusan desain yang berdasar?',
    metadata: { minWords: 200 },
    defaultPoints: 25,
    category: ChallengeCategory.UI_UX,
    difficulty: ChallengeDifficulty.INTERMEDIATE,
    skills: ['Riset Pengguna', 'Pengambilan Keputusan'],
  },
  {
    type: ComponentType.URL_SUBMISSION,
    question:
      'Kirim tautan prototipe interaktif untuk alur pendaftaran akun baru, mulai dari layar awal sampai berhasil masuk.',
    metadata: { placeholder: 'https://figma.com/...', requireDescription: true },
    defaultPoints: 30,
    category: ChallengeCategory.UI_UX,
    difficulty: ChallengeDifficulty.INTERMEDIATE,
    skills: ['Figma', 'UI Design', 'Prototyping'],
  },

  // ==========================================================
  // MARKETING
  // ==========================================================
  {
    type: ComponentType.MULTIPLE_CHOICE,
    question:
      'Iklan Anda mendatangkan 10.000 kunjungan dengan biaya Rp20 juta, menghasilkan 50 pendaftaran dan 5 pembelian senilai Rp2 juta masing-masing. Angka mana yang paling penting dilaporkan ke manajemen?',
    options: [
      { id: 'a', text: 'Jumlah kunjungan', isCorrect: false },
      { id: 'b', text: 'Biaya per kunjungan', isCorrect: false },
      {
        id: 'c',
        text: 'Pendapatan Rp10 juta terhadap biaya Rp20 juta — kampanye ini rugi',
        isCorrect: true,
      },
      { id: 'd', text: 'Tingkat konversi pendaftaran 0,5%', isCorrect: false },
    ],
    defaultPoints: 15,
    category: ChallengeCategory.MARKETING,
    difficulty: ChallengeDifficulty.INTERMEDIATE,
    skills: ['Analitik Pemasaran', 'Pengambilan Keputusan'],
  },
  {
    type: ComponentType.ESSAY,
    question:
      'Anda punya anggaran Rp5 juta untuk memperkenalkan produk baru ke kalangan mahasiswa dalam satu bulan. Susun rencananya beserta ukuran keberhasilannya.',
    metadata: { minWords: 300 },
    defaultPoints: 30,
    category: ChallengeCategory.MARKETING,
    difficulty: ChallengeDifficulty.INTERMEDIATE,
    skills: ['Strategi Pemasaran', 'Perencanaan', 'Analitik Pemasaran'],
  },
  {
    type: ComponentType.FILE_UPLOAD,
    question:
      'Susun kalender konten satu bulan untuk sebuah merek kopi lokal: kanal, tema mingguan, dan contoh tiga unggahan lengkap dengan teksnya.',
    metadata: { acceptedFormats: ['pdf', 'xlsx', 'docx'], maxFileSizeMb: 10 },
    defaultPoints: 30,
    category: ChallengeCategory.MARKETING,
    difficulty: ChallengeDifficulty.BEGINNER,
    skills: ['Content Marketing', 'Perencanaan'],
  },

  // ==========================================================
  // PRODUCT
  // ==========================================================
  {
    type: ComponentType.MULTIPLE_CHOICE,
    question:
      'Sebuah aplikasi catatan ingin memilih satu metrik utama untuk dipantau tim. Mana yang paling menggambarkan bahwa produknya benar-benar berguna?',
    options: [
      { id: 'a', text: 'Jumlah unduhan per bulan', isCorrect: false },
      { id: 'b', text: 'Jumlah pengguna yang membuat catatan di lebih dari satu hari dalam seminggu', isCorrect: true },
      { id: 'c', text: 'Jumlah akun terdaftar', isCorrect: false },
      { id: 'd', text: 'Rata-rata lama sesi', isCorrect: false },
    ],
    defaultPoints: 15,
    category: ChallengeCategory.PRODUCT,
    difficulty: ChallengeDifficulty.INTERMEDIATE,
    skills: ['Manajemen Produk', 'Analisis Data'],
  },
  {
    type: ComponentType.ESSAY,
    question:
      'Lima permintaan fitur masuk dan semuanya disebut mendesak oleh pengusulnya. Jelaskan cara Anda menentukan urutan pengerjaan dan bagaimana Anda menyampaikan hasilnya kepada yang permintaannya ditunda.',
    metadata: { minWords: 250 },
    defaultPoints: 30,
    category: ChallengeCategory.PRODUCT,
    difficulty: ChallengeDifficulty.ADVANCED,
    skills: ['Manajemen Produk', 'Prioritisasi', 'Stakeholder Management'],
  },
  {
    type: ComponentType.ESSAY,
    question:
      'Klien terbesar Anda meminta fitur yang hanya berguna baginya dan akan menyulitkan pengguna lain. Bagaimana Anda menanggapinya?',
    metadata: { minWords: 200 },
    defaultPoints: 25,
    category: ChallengeCategory.PRODUCT,
    difficulty: ChallengeDifficulty.ADVANCED,
    skills: ['Manajemen Produk', 'Stakeholder Management', 'Komunikasi'],
  },
];

async function resolveSkillIds(names: string[]): Promise<string[]> {
  const ids: string[] = [];

  for (const name of names) {
    const skill = await prisma.skill.upsert({
      where: { name },
      update: {},
      create: { name },
      select: { id: true },
    });
    ids.push(skill.id);
  }

  return ids;
}

async function main() {
  console.log(`Menyemai ${ITEMS.length} soal ke bank platform...`);

  let created = 0;
  let skipped = 0;

  for (const item of ITEMS) {
    const existing = await prisma.questionBankItem.findFirst({
      where: { companyId: null, question: item.question },
      select: { id: true },
    });

    if (existing) {
      skipped++;
      continue;
    }

    const skillIds = await resolveSkillIds(item.skills);

    await prisma.questionBankItem.create({
      data: {
        companyId: null,
        type: item.type,
        question: item.question,
        description: item.description,
        options: item.options ?? undefined,
        // Prisma menuntut InputJsonValue; `Record<string, unknown>` yang lebih
        // longgar dipakai di daftar di atas supaya isinya enak dibaca.
        metadata: (item.metadata ?? undefined) as Prisma.InputJsonValue,
        defaultPoints: item.defaultPoints,
        category: item.category,
        difficulty: item.difficulty,
        tags: { create: skillIds.map((skillId) => ({ skillId })) },
      },
    });

    created++;
  }

  const crossField = ITEMS.filter((item) => item.category === null).length;

  console.log(
    `Selesai. ${created} soal baru, ${skipped} dilewati karena sudah ada.`,
  );
  console.log(
    `${crossField} di antaranya berlaku lintas bidang (soft skill, wawancara, etika kerja).`,
  );
}

main()
  .catch((error) => {
    console.error('Gagal menyemai bank soal:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
