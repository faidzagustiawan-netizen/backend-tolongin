export interface RealDataChallenge {
  title: string;
  summary: string;
  description: string;
  category:
    | 'UI_UX'
    | 'FRONTEND'
    | 'BACKEND'
    | 'DATA_SCIENCE'
    | 'MARKETING'
    | 'PRODUCT';
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  sections: Array<{
    title: string;
    description: string;
    components: Array<{
      type:
        | 'MULTIPLE_CHOICE'
        | 'ESSAY'
        | 'FILE_UPLOAD'
        | 'VIDEO_UPLOAD'
        | 'URL_SUBMISSION'
        | 'LIVE_CODING';
      question: string;
      options?: Array<{ text: string; isCorrect: boolean }>;
      correctAnswerText?: string;
      wrongAnswerText?: string;
    }>;
  }>;
}

export const realChallenges: RealDataChallenge[] = [
  // UI_UX (5 challenges)
  {
    title: 'Redesign Alur Checkout E-commerce',
    summary: 'Memperbaiki drop-off rate pada halaman checkout',
    description:
      'Saat ini, tingkat drop-off pada halaman checkout mencapai 60%. Tugas Anda adalah merancang ulang pengalaman pengguna agar proses pembayaran menjadi lebih intuitif dan meningkatkan conversion rate.',
    category: 'UI_UX',
    difficulty: 'ADVANCED',
    sections: [
      {
        title: 'Analisis Masalah',
        description: 'Temukan pain points dari alur yang ada.',
        components: [
          {
            type: 'ESSAY',
            question:
              'Berdasarkan data drop-off 60% di halaman pengiriman, apa hipotesis utama Anda terkait penyebabnya?',
            correctAnswerText:
              'Pengguna terkejut dengan biaya pengiriman yang baru muncul di akhir proses, atau form pengisian alamat terlalu panjang dan tidak memiliki fitur auto-complete.',
            wrongAnswerText:
              'Tombol warnanya kurang mencolok sehingga pengguna tidak tahu cara lanjut.',
          },
        ],
      },
      {
        title: 'Desain Solusi',
        description: 'Buat wireframe dan prototype.',
        components: [
          {
            type: 'URL_SUBMISSION',
            question: 'Kirimkan link Figma prototype Anda.',
            correctAnswerText:
              'https://www.figma.com/file/xyz123/Checkout-Redesign',
            wrongAnswerText: 'https://google.com',
          },
        ],
      },
    ],
  },
  {
    title: 'Dashboard Analitik Real-time',
    summary: 'Desain antarmuka dashboard untuk data dalam jumlah besar',
    description:
      'Buat desain dashboard yang mampu menampilkan metrik kunci secara real-time tanpa membuat pengguna merasa kewalahan oleh data.',
    category: 'UI_UX',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Pemilihan Komponen Visual',
        description: 'Tentukan chart yang tepat.',
        components: [
          {
            type: 'MULTIPLE_CHOICE',
            question:
              'Komponen apa yang paling tepat untuk menunjukkan tren penjualan harian selama 30 hari terakhir?',
            options: [
              { text: 'Pie Chart', isCorrect: false },
              { text: 'Line Chart', isCorrect: true },
              { text: 'Scatter Plot', isCorrect: false },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Onboarding Mobile Banking',
    summary: 'Menyederhanakan proses KYC',
    description:
      'Proses verifikasi identitas (KYC) sering kali memakan waktu. Rancang pengalaman onboarding yang cepat namun tetap aman sesuai regulasi OJK.',
    category: 'UI_UX',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Alur KYC',
        description: 'Rancang flow pengambilan foto KTP dan selfie.',
        components: [
          {
            type: 'FILE_UPLOAD',
            question: 'Unggah dokumen user flow KYC Anda (PDF).',
            correctAnswerText: 'user_flow_kyc_final.pdf',
            wrongAnswerText: 'flow.png',
          },
        ],
      },
    ],
  },
  {
    title: 'Landing Page B2B SaaS',
    summary: 'Desain halaman untuk meningkatkan lead generation',
    description:
      'Rancang landing page untuk produk manajemen SDM yang menyasar HR Manager perusahaan skala menengah.',
    category: 'UI_UX',
    difficulty: 'BEGINNER',
    sections: [
      {
        title: 'Copywriting & Layout',
        description: 'Penempatan hero section dan call-to-action.',
        components: [
          {
            type: 'ESSAY',
            question:
              'Apa headline utama yang akan Anda pasang di atas lipatan (above the fold)?',
            correctAnswerText:
              'Tingkatkan Produktivitas Tim Anda dengan Sistem HR Otomatis – Coba Gratis 14 Hari.',
            wrongAnswerText: 'Selamat datang di aplikasi kami.',
          },
        ],
      },
    ],
  },
  {
    title: 'Aksesibilitas Aplikasi Pemerintahan',
    summary: 'Audit dan perbaikan aksesibilitas (WCAG)',
    description:
      'Aplikasi layanan publik harus dapat diakses oleh semua orang, termasuk penyandang disabilitas. Lakukan audit pada warna dan tipografi.',
    category: 'UI_UX',
    difficulty: 'ADVANCED',
    sections: [
      {
        title: 'Contrast Ratio',
        description: 'Pastikan teks mudah dibaca.',
        components: [
          {
            type: 'MULTIPLE_CHOICE',
            question:
              'Berapa rasio kontras minimum untuk teks normal menurut standar WCAG 2.1 Level AA?',
            options: [
              { text: '3.0:1', isCorrect: false },
              { text: '4.5:1', isCorrect: true },
              { text: '7.0:1', isCorrect: false },
            ],
          },
        ],
      },
    ],
  },

  // FRONTEND (5 challenges)
  {
    title: 'Implementasi Keranjang Belanja Berbasis State',
    summary: 'Manajemen state keranjang tanpa lag',
    description:
      'Bangun komponen keranjang belanja menggunakan React atau Vue yang menangani penambahan, pengurangan, dan penghapusan item secara instan.',
    category: 'FRONTEND',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Logic Manipulasi Array',
        description: 'Update jumlah barang di keranjang.',
        components: [
          {
            type: 'LIVE_CODING',
            question:
              'Tulis fungsi untuk menambah jumlah item berdasarkan ID di state keranjang.',
            correctAnswerText:
              'function addItem(cart, id) { return cart.map(item => item.id === id ? { ...item, qty: item.qty + 1 } : item); }',
            wrongAnswerText:
              'function addItem(cart, id) { cart.find(i => i.id == id).qty++; return cart; }',
          },
        ],
      },
    ],
  },
  {
    title: 'Infinite Scroll & Virtualization',
    summary: 'Optimalisasi performa list panjang',
    description:
      'Tampilkan 10.000 data transaksi tanpa membuat browser menjadi lambat dengan teknik DOM virtualization.',
    category: 'FRONTEND',
    difficulty: 'ADVANCED',
    sections: [
      {
        title: 'Pemahaman Konsep',
        description: 'Mengapa virtualization penting?',
        components: [
          {
            type: 'MULTIPLE_CHOICE',
            question:
              'Apa tujuan utama dari windowing/virtualization pada list panjang?',
            options: [
              {
                text: 'Hanya me-render elemen DOM yang terlihat di layar untuk menghemat memori',
                isCorrect: true,
              },
              {
                text: 'Mendownload data dari server secara bertahap',
                isCorrect: false,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Integrasi Payment Gateway API',
    summary: 'Menghubungkan frontend dengan Midtrans/Stripe',
    description:
      'Buat form checkout dan panggil API payment gateway untuk mendapatkan token transaksi.',
    category: 'FRONTEND',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'API Call & Error Handling',
        description: 'Panggil endpoint payment.',
        components: [
          {
            type: 'LIVE_CODING',
            question:
              "Gunakan fetch untuk memanggil '/api/get-token' dengan body JSON berisi orderId dan amount, tangani juga error-nya.",
            correctAnswerText:
              "async function getToken(order) { try { const res = await fetch('/api/get-token', { method: 'POST', body: JSON.stringify(order) }); if (!res.ok) throw new Error('Failed'); return await res.json(); } catch(e) { console.error(e); return null; } }",
            wrongAnswerText:
              "function getToken(o) { fetch('/api/get-token').then(r => r.json()); }",
          },
        ],
      },
    ],
  },
  {
    title: 'Form Wizard Multi-step dengan Validasi',
    summary: 'Pendaftaran pengguna yang kompleks',
    description:
      'Buat form registrasi 3 langkah dengan validasi menggunakan library seperti Formik atau React Hook Form + Zod.',
    category: 'FRONTEND',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Persistensi Data Sementara',
        description: 'Menyimpan data antar langkah.',
        components: [
          {
            type: 'ESSAY',
            question:
              'Bagaimana cara terbaik Anda menjaga data form yang sudah diisi di Step 1 ketika user pindah ke Step 2?',
            correctAnswerText:
              'Menggunakan state management global seperti Redux/Zustand, atau menempatkan state form di komponen Parent yang membungkus semua step.',
            wrongAnswerText: 'Simpan saja di localStorage atau biarkan di DOM.',
          },
        ],
      },
    ],
  },
  {
    title: 'PWA (Progressive Web App) untuk Portal Berita',
    summary: 'Menambahkan fitur offline dan installability',
    description:
      'Ubah aplikasi web berita yang sudah ada menjadi PWA dengan Service Worker agar dapat membaca berita yang sudah di-cache secara offline.',
    category: 'FRONTEND',
    difficulty: 'ADVANCED',
    sections: [
      {
        title: 'Service Worker Caching Strategy',
        description: 'Pilih strategi cache.',
        components: [
          {
            type: 'MULTIPLE_CHOICE',
            question:
              'Strategi cache apa yang paling cocok untuk artikel berita yang jarang berubah namun harus memuat secepat mungkin?',
            options: [
              { text: 'Stale-while-revalidate', isCorrect: true },
              { text: 'Network Only', isCorrect: false },
              { text: 'Cache Only', isCorrect: false },
            ],
          },
        ],
      },
    ],
  },

  // BACKEND (5 challenges)
  {
    title: 'Sistem Autentikasi dengan JWT',
    summary: 'Membangun API login dan proteksi route',
    description:
      'Buat endpoint login yang memvalidasi password dan mengembalikan JWT. Implementasikan middleware untuk memproteksi endpoint lainnya.',
    category: 'BACKEND',
    difficulty: 'BEGINNER',
    sections: [
      {
        title: 'Pembuatan Middleware',
        description: 'Verifikasi token JWT.',
        components: [
          {
            type: 'LIVE_CODING',
            question:
              'Tulis middleware Express.js untuk memverifikasi header Authorization Bearer token.',
            correctAnswerText:
              "const verifyToken = (req, res, next) => { const token = req.headers.authorization?.split(' ')[1]; if(!token) return res.sendStatus(401); jwt.verify(token, process.env.SECRET, (err, user) => { if(err) return res.sendStatus(403); req.user = user; next(); }); };",
            wrongAnswerText:
              'const auth = (req, res, next) => { if (req.headers.token) next(); else res.status(401); }',
          },
        ],
      },
    ],
  },
  {
    title: 'Sistem Order Berbasis Message Broker',
    summary: 'Menggunakan RabbitMQ untuk proses order',
    description:
      'Pisahkan proses pembuatan pesanan dengan notifikasi email dan penghitungan komisi menggunakan RabbitMQ.',
    category: 'BACKEND',
    difficulty: 'ADVANCED',
    sections: [
      {
        title: 'Arsitektur Event-Driven',
        description: 'Menghindari tight coupling.',
        components: [
          {
            type: 'URL_SUBMISSION',
            question:
              'Kirimkan link repository GitHub yang berisi implementasi publisher dan consumer RabbitMQ Anda.',
            correctAnswerText:
              'https://github.com/talent/microservice-rabbitmq-order',
            wrongAnswerText: 'https://github.com/talent',
          },
        ],
      },
    ],
  },
  {
    title: 'Optimasi Query Database Lambat',
    summary: 'Indexing dan Query Refactoring',
    description:
      'Sebuah query untuk laporan bulanan memakan waktu 15 detik. Analisis dan optimalkan query tersebut menggunakan EXPLAIN dan Indexing.',
    category: 'BACKEND',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Identifikasi Bottleneck',
        description: 'Membaca execution plan.',
        components: [
          {
            type: 'ESSAY',
            question:
              "Apa arti dari 'Full Table Scan' (Seq Scan) dalam hasil EXPLAIN dan bagaimana cara menghindarinya jika kita sering melakukan filter berdasarkan kolom 'created_at'?",
            correctAnswerText:
              "Itu berarti database membaca setiap baris dalam tabel. Untuk menghindarinya, kita harus menambahkan INDEX (seperti B-Tree) pada kolom 'created_at'.",
            wrongAnswerText:
              'Itu berarti tabel sudah penuh. Cara menghindarinya adalah dengan menghapus data lama.',
          },
        ],
      },
    ],
  },
  {
    title: 'Implementasi Rate Limiting',
    summary: 'Melindungi API dari serangan DDoS dan Brute Force',
    description:
      'Implementasikan Rate Limiting pada endpoint /api/login yang membatasi 5 percobaan per menit dari IP yang sama menggunakan Redis.',
    category: 'BACKEND',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Pemilihan Storage',
        description: 'Mengapa Redis?',
        components: [
          {
            type: 'MULTIPLE_CHOICE',
            question:
              'Mengapa Redis sangat cocok untuk Rate Limiting dibandingkan menyimpan counter di MySQL?',
            options: [
              {
                text: 'Karena Redis beroperasi di memori sehingga operasi atomic INCR sangat cepat',
                isCorrect: true,
              },
              { text: 'Karena Redis mendukung relasi tabel', isCorrect: false },
              {
                text: 'Karena Redis menyimpan data secara permanen di disk dengan kompresi',
                isCorrect: false,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Upload dan Pemrosesan Gambar (S3)',
    summary: 'Menyimpan gambar ke AWS S3',
    description:
      'Buat endpoint untuk menerima file gambar, kompres ukurannya, lalu unggah ke bucket AWS S3 dan simpan URL-nya ke database.',
    category: 'BACKEND',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Penanganan File di Backend',
        description: 'Menggunakan Multer dan AWS SDK.',
        components: [
          {
            type: 'LIVE_CODING',
            question:
              'Tuliskan kode fungsi untuk mengunggah buffer file ke S3 menggunakan AWS SDK v3.',
            correctAnswerText:
              "const uploadS3 = async (buffer, filename) => { const command = new PutObjectCommand({ Bucket: 'my-bucket', Key: filename, Body: buffer }); return await s3Client.send(command); };",
            wrongAnswerText:
              'function upload(file) { s3.upload(file); return true; }',
          },
        ],
      },
    ],
  },

  // DATA_SCIENCE (5 challenges)
  {
    title: 'Prediksi Churn Pelanggan Telco',
    summary: 'Membangun model Machine Learning klasifikasi',
    description:
      'Gunakan dataset berisi riwayat panggilan, tagihan, dan keluhan pelanggan untuk memprediksi apakah pelanggan akan berhenti berlangganan bulan depan.',
    category: 'DATA_SCIENCE',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Data Preprocessing',
        description: 'Menangani missing values dan encoding.',
        components: [
          {
            type: 'LIVE_CODING',
            question:
              "Tulis kode Python menggunakan Pandas untuk mengisi nilai kosong pada kolom 'Tenure' dengan nilai median.",
            correctAnswerText:
              "df['Tenure'] = df['Tenure'].fillna(df['Tenure'].median())",
            wrongAnswerText: "df['Tenure'].drop_na()",
          },
        ],
      },
      {
        title: 'Evaluasi Model',
        description: 'Pilih metrik yang tepat.',
        components: [
          {
            type: 'MULTIPLE_CHOICE',
            question:
              'Jika kelas churn sangat tidak seimbang (minoritas), metrik mana yang lebih relevan dibandingkan Accuracy?',
            options: [
              { text: 'F1-Score / Recall', isCorrect: true },
              { text: 'Mean Squared Error', isCorrect: false },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Sistem Rekomendasi Produk E-commerce',
    summary: 'Collaborative Filtering',
    description:
      'Bangun sistem yang merekomendasikan produk berdasarkan riwayat pembelian pengguna yang memiliki kemiripan profil.',
    category: 'DATA_SCIENCE',
    difficulty: 'ADVANCED',
    sections: [
      {
        title: 'Pendekatan Algoritma',
        description: 'Menentukan metode filtering.',
        components: [
          {
            type: 'ESSAY',
            question:
              'Jelaskan perbedaan mendasar antara User-based Collaborative Filtering dan Item-based Collaborative Filtering.',
            correctAnswerText:
              'User-based mencari user yang mirip untuk merekomendasikan item, sedangkan Item-based mencari item yang mirip dengan item yang pernah dibeli/disukai user tersebut.',
            wrongAnswerText:
              'User-based menggunakan nama user, Item-based menggunakan harga barang.',
          },
        ],
      },
    ],
  },
  {
    title: 'Forecasting Penjualan Ritel',
    summary: 'Time-series analysis',
    description:
      'Prediksi total penjualan harian untuk 30 hari ke depan berdasarkan data penjualan historis selama 2 tahun terakhir yang memiliki pola musiman (seasonal).',
    category: 'DATA_SCIENCE',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Analisis Tren dan Musiman',
        description: 'Model ARIMA/Prophet.',
        components: [
          {
            type: 'URL_SUBMISSION',
            question:
              'Kirimkan link Google Colab / GitHub notebook eksperimen Prophet Anda.',
            correctAnswerText:
              'https://colab.research.google.com/drive/1a2b3c-Forecasting',
            wrongAnswerText: 'https://facebook.github.io/prophet/',
          },
        ],
      },
    ],
  },
  {
    title: 'Analisis Sentimen Ulasan App Store',
    summary: 'Natural Language Processing (NLP)',
    description:
      'Klasifikasikan teks ulasan pengguna ke dalam kategori Positif, Netral, atau Negatif untuk membantu tim produk memahami kepuasan pelanggan.',
    category: 'DATA_SCIENCE',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Text Preprocessing',
        description: 'Membersihkan teks.',
        components: [
          {
            type: 'LIVE_CODING',
            question:
              'Tulis fungsi Python (dengan regex) untuk menghapus semua tanda baca dari sebuah string teks ulasan.',
            correctAnswerText:
              "import re\n\ndef clean_text(text):\n    return re.sub(r'[^\\w\\s]', '', text)",
            wrongAnswerText: "def clean(t): return t.replace(',', '')",
          },
        ],
      },
    ],
  },
  {
    title: 'Customer Segmentation (Clustering)',
    summary: 'Mengelompokkan pelanggan dengan K-Means',
    description:
      'Kelompokkan pelanggan ke dalam beberapa segmen berdasarkan Recency, Frequency, dan Monetary (RFM) agar tim marketing dapat membuat promosi yang tepat sasaran.',
    category: 'DATA_SCIENCE',
    difficulty: 'BEGINNER',
    sections: [
      {
        title: 'Penentuan Jumlah Cluster',
        description: 'Metode Elbow.',
        components: [
          {
            type: 'MULTIPLE_CHOICE',
            question:
              'Metode visualisasi apa yang umum digunakan untuk menentukan jumlah K optimal pada K-Means?',
            options: [
              { text: 'Elbow Method', isCorrect: true },
              { text: 'Boxplot', isCorrect: false },
              { text: 'Histogram', isCorrect: false },
            ],
          },
        ],
      },
    ],
  },

  // MARKETING (5 challenges)
  {
    title: 'Optimasi Facebook & IG Ads',
    summary: 'Menurunkan Cost per Acquisition (CPA)',
    description:
      'Saat ini CPA campaign kita menyentuh angka Rp150.000, padahal targetnya adalah Rp80.000. Analisis dashboard Ads Manager fiktif berikut dan berikan rencana perbaikan.',
    category: 'MARKETING',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Analisis Metrik',
        description: 'Evaluasi CTR dan CPM.',
        components: [
          {
            type: 'ESSAY',
            question:
              'Jika CTR tinggi (3%) tapi Conversion Rate rendah (0.5%), apa kemungkinan terbesar masalahnya dan bagaimana solusinya?',
            correctAnswerText:
              'Kreatif iklan sangat menarik, tapi landing page tidak relevan, membingungkan, atau proses checkout-nya bermasalah. Solusinya optimasi landing page.',
            wrongAnswerText: 'Anggaran iklannya kurang besar.',
          },
        ],
      },
    ],
  },
  {
    title: 'Strategi SEO On-Page Blog SaaS',
    summary: 'Meningkatkan organik traffic',
    description:
      "Sebuah blog tentang 'Aplikasi Kasir' tertahan di halaman 3 Google. Lakukan audit SEO On-page dan buat rencana optimasinya.",
    category: 'MARKETING',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Keyword Optimization',
        description: 'Penggunaan elemen HTML.',
        components: [
          {
            type: 'MULTIPLE_CHOICE',
            question:
              'Di mana posisi paling krusial untuk meletakkan primary keyword agar memiliki bobot SEO On-page tertinggi?',
            options: [
              {
                text: 'Di dalam tag <h1> dan Title Tag (<title>)',
                isCorrect: true,
              },
              { text: 'Di bagian footer website', isCorrect: false },
              {
                text: 'Di attribute alt pada gambar background',
                isCorrect: false,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Campaign Email Marketing Retention',
    summary: 'Mengaktifkan kembali dormant users',
    description:
      'Kita memiliki 50.000 pengguna yang tidak login selama 3 bulan. Buat alur email (drip campaign) 3 tahap untuk mengaktifkan mereka kembali.',
    category: 'MARKETING',
    difficulty: 'BEGINNER',
    sections: [
      {
        title: 'Copywriting Subjek Email',
        description: 'Meningkatkan Open Rate.',
        components: [
          {
            type: 'ESSAY',
            question:
              'Tuliskan Subject Line untuk email pertama yang bersifat personal dan mengundang rasa penasaran, maksimal 7 kata.',
            correctAnswerText: 'Kami merindukan Anda, (Nama) - Ada hadiah!',
            wrongAnswerText:
              'Silakan buka email ini sekarang juga karena penting',
          },
        ],
      },
    ],
  },
  {
    title: 'Content Calendar Social Media TiktTok',
    summary: 'Meningkatkan brand awareness Gen-Z',
    description:
      'Buat perencanaan konten TikTok selama 1 bulan (12 video) untuk produk skincare lokal khusus kulit berjerawat.',
    category: 'MARKETING',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Pilar Konten',
        description: 'Pembagian tipe konten.',
        components: [
          {
            type: 'FILE_UPLOAD',
            question:
              'Unggah dokumen spreadsheet (Excel/PDF) berisi Content Calendar 1 bulan Anda.',
            correctAnswerText: 'tiktok_calendar_skincare.xlsx',
            wrongAnswerText: 'video1.mp4',
          },
        ],
      },
    ],
  },
  {
    title: 'Strategi Peluncuran Produk Baru (GTM)',
    summary: 'Go-to-Market Strategy',
    description:
      "Susun strategi peluncuran (Go-to-Market) untuk fitur 'AI Copywriter' yang baru saja dirilis oleh platform SaaS Marketing kita.",
    category: 'MARKETING',
    difficulty: 'ADVANCED',
    sections: [
      {
        title: 'Positioning & Messaging',
        description: 'Menentukan Unique Value Proposition.',
        components: [
          {
            type: 'MULTIPLE_CHOICE',
            question:
              'Apa elemen utama yang paling pertama harus didefinisikan dalam sebuah dokumen Go-To-Market?',
            options: [
              {
                text: 'Target Audience (Ideal Customer Profile) dan Problem yang diselesaikan',
                isCorrect: true,
              },
              { text: 'Desain logo dan warna tombol', isCorrect: false },
            ],
          },
        ],
      },
    ],
  },

  // PRODUCT (5 challenges)
  {
    title: 'Pembuatan Product Requirements Document (PRD)',
    summary: 'Fitur Subscription & Paywall',
    description:
      'Aplikasi kita akan beralih ke model Freemium. Buat PRD lengkap untuk fitur Paywall dan Subscription (Bulanan/Tahunan).',
    category: 'PRODUCT',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Definisi Scope',
        description: 'User Stories.',
        components: [
          {
            type: 'ESSAY',
            question:
              'Tuliskan satu User Story untuk pengguna gratis yang mencoba mengakses fitur berbayar.',
            correctAnswerText:
              'Sebagai pengguna gratis, saya ingin melihat popup penjelasan fitur premium ketika mengklik fitur terkunci, agar saya tahu apa yang saya dapatkan jika berlangganan.',
            wrongAnswerText: 'User tidak bisa klik.',
          },
        ],
      },
      {
        title: 'Dokumen PRD',
        description: 'Pengumpulan dokumen lengkap.',
        components: [
          {
            type: 'URL_SUBMISSION',
            question:
              'Kirimkan link Notion / Google Docs yang berisi PRD Anda.',
            correctAnswerText:
              'https://docs.google.com/document/d/1abc.../edit',
            wrongAnswerText: 'https://notion.com',
          },
        ],
      },
    ],
  },
  {
    title: 'Prioritas Fitur Backlog (RICE Framework)',
    summary: 'Manajemen Backlog',
    description:
      'Diberikan 10 ide fitur dari tim sales dan customer success. Gunakan framework RICE (Reach, Impact, Confidence, Effort) untuk mengurutkan prioritasnya.',
    category: 'PRODUCT',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Kalkulasi RICE',
        description: 'Menghitung skor prioritas.',
        components: [
          {
            type: 'LIVE_CODING',
            question:
              'Buat fungsi kalkulasi sederhana di JavaScript untuk menghitung skor RICE dari object { reach, impact, confidence, effort }. (Confidence dalam persen, misal 0.8)',
            correctAnswerText:
              'function calcRice(f) { return (f.reach * f.impact * f.confidence) / f.effort; }',
            wrongAnswerText:
              'function calc(r, i, c, e) { return r + i + c + e; }',
          },
        ],
      },
    ],
  },
  {
    title: 'Rancangan A/B Testing Onboarding',
    summary: 'Meningkatkan Aktivasi Pengguna Baru',
    description:
      "Rancang A/B test untuk membandingkan onboarding dengan 'Tutorial Video' vs 'Tooltip Interaktif' guna melihat mana yang meningkatkan metrik 'First Time Value'.",
    category: 'PRODUCT',
    difficulty: 'ADVANCED',
    sections: [
      {
        title: 'Metrik Kesuksesan',
        description: 'Primary dan Secondary Metrics.',
        components: [
          {
            type: 'MULTIPLE_CHOICE',
            question:
              'Dalam konteks A/B testing ini, apa yang paling tepat dijadikan Primary Metric (Metrik Utama)?',
            options: [
              {
                text: 'Persentase user yang berhasil menyelesaikan core action pertama (Activation Rate)',
                isCorrect: true,
              },
              { text: 'Jumlah likes pada video tutorial', isCorrect: false },
              { text: 'Waktu muat halaman (Page load time)', isCorrect: false },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Analisis Kompetitor Aplikasi Edukasi (EdTech)',
    summary: 'Competitive Landscape',
    description:
      'Lakukan riset mendalam terhadap 3 aplikasi EdTech lokal. Buat matriks perbandingan fitur, harga, dan kelebihan/kekurangan masing-masing.',
    category: 'PRODUCT',
    difficulty: 'BEGINNER',
    sections: [
      {
        title: 'Identifikasi Unique Selling Proposition',
        description: 'Mencari celah pasar.',
        components: [
          {
            type: 'ESSAY',
            question:
              'Dari hasil riset kompetitor, sebutkan satu celah atau kelemahan umum mereka yang bisa kita jadikan fitur unggulan (USP) di produk kita.',
            correctAnswerText:
              "Sebagian besar kompetitor tidak memiliki fitur interaksi langsung dengan tutor (live QA), sehingga kita bisa menjadikan 'Live Chat Tutor 24/7' sebagai USP utama.",
            wrongAnswerText: 'Aplikasi mereka jelek.',
          },
        ],
      },
    ],
  },
  {
    title: 'Post-Launch Feature Analysis',
    summary: 'Menganalisis data peluncuran fitur',
    description:
      "Fitur 'Share to Instagram' baru saja rilis bulan lalu. Analisis data penggunaannya dan berikan rekomendasi apakah fitur tersebut harus dipertahankan, diiterasi, atau dimatikan.",
    category: 'PRODUCT',
    difficulty: 'ADVANCED',
    sections: [
      {
        title: 'Pengambilan Keputusan Berbasis Data',
        description: 'Membaca adopsi fitur.',
        components: [
          {
            type: 'MULTIPLE_CHOICE',
            question:
              'Jika Adoption Rate fitur baru hanya 1% tetapi Retention Rate dari 1% pengguna tersebut meningkat drastis, langkah apa yang paling logis diambil?',
            options: [
              {
                text: 'Iterasi UX dan Discovery fitur agar lebih mudah ditemukan oleh lebih banyak user',
                isCorrect: true,
              },
              {
                text: 'Matikan fiturnya karena 1% terlalu kecil',
                isCorrect: false,
              },
              { text: 'Buat fitur baru lainnya', isCorrect: false },
            ],
          },
        ],
      },
    ],
  },
];

export const publicChallenges: RealDataChallenge[] = [
  {
    title: 'Butuh Review: Skripsi Aplikasi Klasifikasi Sampah',
    summary:
      'Mohon direview struktur model CNN saya, akurasinya tertahan di 60%',
    description:
      'Halo teman-teman, saya sedang mengerjakan tugas akhir/skripsi menggunakan Python dan TensorFlow. Namun akurasi model CNN saya mentok di 60%. Mohon bantuannya untuk mereview struktur layer dan hyperparameternya.',
    category: 'DATA_SCIENCE',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Code Review',
        description: 'Review repository dan beri masukan',
        components: [
          {
            type: 'ESSAY',
            question:
              'Berdasarkan link github saya, apa penyebab utama overfitting di model saya?',
            correctAnswerText:
              'Kurangnya teknik Data Augmentation dan tidak ada Dropout layer.',
            wrongAnswerText: 'Datasetnya terlalu kecil.',
          },
        ],
      },
    ],
  },
  {
    title: 'Mencari Co-Founder (Backend) untuk Startup EdTech',
    summary: 'Project sampingan membangun LMS untuk anak SMA',
    description:
      'Saya UI/UX designer dan butuh technical co-founder. Sistemnya bagi hasil (equity). Challenge ini untuk menyeleksi partner yang cocok dari segi teknikal dan kecocokan visi.',
    category: 'BACKEND',
    difficulty: 'ADVANCED',
    sections: [
      {
        title: 'System Design',
        description: 'Rancangan arsitektur LMS',
        components: [
          {
            type: 'URL_SUBMISSION',
            question:
              'Kirimkan link diagram arsitektur (Miro/Draw.io) bagaimana Anda akan merancang sistem video streaming course agar hemat bandwidth.',
            correctAnswerText: 'https://miro.com/app/board/xyz',
            wrongAnswerText: 'https://google.com',
          },
        ],
      },
    ],
  },
  {
    title: 'Bantuan Debugging React Native',
    summary: 'Stuck di React Navigation v6, screen tidak berpindah',
    description:
      'Saya sedang mengerjakan project freelance dan stuck. Ketika menekan tombol login, aplikasinya tidak pindah ke Home Screen dan hanya loading terus. Dibayar 50 token untuk yang bisa solve cepat!',
    category: 'FRONTEND',
    difficulty: 'BEGINNER',
    sections: [
      {
        title: 'Pemecahan Masalah',
        description: 'Penyelesaian bug navigasi',
        components: [
          {
            type: 'LIVE_CODING',
            question:
              'Tuliskan perbaikan kode navigation.navigate() yang benar di fungsi handleLogin saya.',
            correctAnswerText: "navigation.replace('Home');",
            wrongAnswerText: "navigation.push('Home')",
          },
        ],
      },
    ],
  },
  {
    title: 'Tolong Desain Ulang Landing Page Portofolio Saya',
    summary: 'Desain saya kaku, butuh sentuhan modern',
    description:
      'Saya adalah backend engineer dan tidak bisa mendesain. Minta tolong komunitas untuk meredesign portofolio saya dengan gaya dark mode / glassmorphism.',
    category: 'UI_UX',
    difficulty: 'BEGINNER',
    sections: [
      {
        title: 'Usulan Desain',
        description: 'Figma Prototype',
        components: [
          {
            type: 'URL_SUBMISSION',
            question: 'Link Figma hasil redesain Anda',
            correctAnswerText: 'https://www.figma.com/file/abc',
            wrongAnswerText: 'https://google.com',
          },
        ],
      },
    ],
  },
  {
    title: 'Riset Kompetitor untuk Aplikasi Kasir UMKM',
    summary: 'Minta tolong analisis fitur Moka vs Pawoon',
    description:
      'Sedang riset pasar untuk membangun POS gratis bagi warung kecil. Butuh bantuan product manager untuk membedah fitur-fitur POS yang ada di pasaran.',
    category: 'PRODUCT',
    difficulty: 'INTERMEDIATE',
    sections: [
      {
        title: 'Tabel Perbandingan',
        description: 'Komparasi Fitur',
        components: [
          {
            type: 'ESSAY',
            question:
              'Sebutkan satu fitur yang ada di Moka namun tidak ada di POS gratisan lainnya, dan apakah warung kecil benar-benar membutuhkannya?',
            correctAnswerText:
              'Manajemen inventaris multi-cabang. Warung kecil tidak membutuhkannya.',
            wrongAnswerText: 'Kasir.',
          },
        ],
      },
    ],
  },
];
