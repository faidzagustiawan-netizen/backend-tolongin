import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import {
  Role,
  VerificationStatus,
  SubscriptionTier,
  ChallengeCategory,
  ChallengeDifficulty,
  ChallengeStatus,
  EnrollmentStatus,
  SubmissionStatus,
  HiringStatus,
} from '@prisma/client';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seed() {
    this.logger.log('Memulai proses seeding data sampel yang lengkap untuk pengujian manual...');
    const saltRounds = 10;
    const defaultPassword = await bcrypt.hash('password123', saltRounds);

    // 1. Buat Badges Gamifikasi
    const badges = [
      {
        title: 'Problem Solver Elite',
        description: 'Menyelesaikan tantangan algoritma dengan efisiensi O(1) atau O(N).',
        iconUrl: 'https://placehold.co/100x100/10b981/ffffff?text=Elite',
        requiredXp: 100,
      },
      {
        title: 'Architect of the Future',
        description: 'Desain arsitektur mikroservis tanpa cacat di bawah beban tinggi.',
        iconUrl: 'https://placehold.co/100x100/10b981/ffffff?text=Arch',
        requiredXp: 250,
      },
      {
        title: 'UI/UX Visionary',
        description: 'Mencapai skor aksesibilitas dan UX 100% pada evaluasi AI.',
        iconUrl: 'https://placehold.co/100x100/10b981/ffffff?text=UX',
        requiredXp: 150,
      },
      {
        title: 'Data Alchemist',
        description: 'Membangun model AI dengan akurasi prediksi p99 di atas 95%.',
        iconUrl: 'https://placehold.co/100x100/10b981/ffffff?text=Data',
        requiredXp: 200,
      },
      {
        title: 'Creative Marketing Genius',
        description: 'Menghasilkan strategi viral dengan proyeksi ROI di atas 300%.',
        iconUrl: 'https://placehold.co/100x100/10b981/ffffff?text=Mktg',
        requiredXp: 150,
      }
    ];

    for (const b of badges) {
      await this.prisma.badge.upsert({ where: { title: b.title }, create: b, update: b });
    }

    // 2. Buat Akun Perusahaan
    const companyUsersData = [
      {
        email: 'hr@goto.com',
        companyName: 'GoTo Group (Gojek Tokopedia)',
        industry: 'E-Commerce & Ride Hailing',
        subscriptionTier: SubscriptionTier.KONGLOMERAT,
        logoUrl: 'https://logo.clearbit.com/gotocompany.com',
        description: 'Ekosistem digital terbesar di Indonesia yang memberdayakan jutaan mitra.',
        websiteUrl: 'https://gotocompany.com',
        companySize: '10,000+ employees',
      },
      {
        email: 'hr@traveloka.com',
        companyName: 'Traveloka',
        industry: 'Online Travel & Lifestyle',
        subscriptionTier: SubscriptionTier.KONGLOMERAT,
        logoUrl: 'https://logo.clearbit.com/traveloka.com',
        description: 'Platform travel dan gaya hidup terdepan di Asia Tenggara.',
        websiteUrl: 'https://traveloka.com',
        companySize: '5,000+ employees',
        trustScore: 65,
      },
      {
        email: 'hr@efishery.com',
        companyName: 'eFishery',
        industry: 'Agritech & Aquaculture',
        subscriptionTier: SubscriptionTier.STARTUP,
        logoUrl: 'https://logo.clearbit.com/efishery.com',
        description: 'Startup agritech perikanan pertama yang mencapai status unicorn.',
        websiteUrl: 'https://efishery.com',
        companySize: '1,000+ employees',
      },
    ];

    const companyProfiles: Record<string, any> = {};
    for (const c of companyUsersData) {
      const user = await this.prisma.user.upsert({
        where: { email: c.email },
        create: { email: c.email, passwordHash: defaultPassword, role: Role.COMPANY, isVerified: true },
        update: {},
      });
      companyProfiles[c.email] = await this.prisma.companyProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id, companyName: c.companyName, industry: c.industry, subscriptionTier: c.subscriptionTier,
          kybStatus: VerificationStatus.VERIFIED, logoUrl: c.logoUrl, description: c.description, websiteUrl: c.websiteUrl, companySize: c.companySize,
          trustScore: c.trustScore || 100,
        },
        update: {
          companyName: c.companyName, industry: c.industry, subscriptionTier: c.subscriptionTier, logoUrl: c.logoUrl, description: c.description,
          trustScore: c.trustScore || 100,
        },
      });
    }

    // 3. Buat Akun Talenta
    const talentUsersData = [
      {
        email: 'budi.developer@gmail.com', fullName: 'Budi Raharjo', headline: 'Senior Full Stack TypeScript Engineer',
        skills: ['NestJS', 'React', 'PostgreSQL', 'Docker', 'GraphQL', 'Redis', 'Backend'], xp: 450, level: 5,
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Budi', githubUrl: 'https://github.com/budiraharjo', linkedinUrl: 'https://linkedin.com/in/budiraharjo',
      },
      {
        email: 'siti.designer@gmail.com', fullName: 'Siti Aminah', headline: 'Lead UI/UX & Product Designer',
        skills: ['Figma', 'Design System', 'User Research', 'UI/UX', 'WCAG AAA'], xp: 350, level: 4,
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Siti', githubUrl: 'https://github.com/sitiaminah', linkedinUrl: 'https://linkedin.com/in/sitiaminah',
      },
      {
        email: 'agus.frontend@gmail.com', fullName: 'Agus Setiawan', headline: 'React & Next.js Performance Expert',
        skills: ['Next.js 15', 'Tailwind CSS', 'Zustand', 'Frontend', 'TypeScript'], xp: 250, level: 3,
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Agus', githubUrl: 'https://github.com/agussetiawan', linkedinUrl: 'https://linkedin.com/in/agussetiawan',
      },
      {
        email: 'dewi.data@gmail.com', fullName: 'Dewi Lestari', headline: 'AI Engineer & Senior Data Scientist',
        skills: ['Python', 'PyTorch', 'LLM', 'Scikit-Learn', 'SQL', 'Data Science'], xp: 150, level: 2,
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Dewi', githubUrl: 'https://github.com/dewilestari', linkedinUrl: 'https://linkedin.com/in/dewilestari',
      },
      {
        email: 'joko.marketing@gmail.com', fullName: 'Joko Anwar', headline: 'Growth Hacker & Creative Strategist',
        skills: ['SEO', 'TikTok Ads', 'Growth Hacking', 'Marketing', 'Analytics'], xp: 50, level: 1,
        avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Joko', githubUrl: 'https://github.com/jokoanwar', linkedinUrl: 'https://linkedin.com/in/jokoanwar',
      }
    ];

    const talentProfiles: Record<string, any> = {};
    for (const t of talentUsersData) {
      const user = await this.prisma.user.upsert({
        where: { email: t.email },
        create: { email: t.email, passwordHash: defaultPassword, role: Role.TALENT, isVerified: true },
        update: {},
      });
      talentProfiles[t.email] = await this.prisma.talentProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id, fullName: t.fullName, headline: t.headline, skills: t.skills, faceVerificationStatus: VerificationStatus.VERIFIED,
          xp: t.xp, level: t.level, avatarUrl: t.avatarUrl, githubUrl: t.githubUrl, linkedinUrl: t.linkedinUrl,
          tokenBalance: 200,
        },
        update: {
          fullName: t.fullName, headline: t.headline, skills: t.skills, xp: t.xp, level: t.level, avatarUrl: t.avatarUrl,
          tokenBalance: 200,
        },
      });
    }

    // 4. Buat Studi Kasus Challenge (Kaya Fitur dengan Brief Attachments)
    const challengesData = [
      {
        companyEmail: 'hr@goto.com',
        title: 'GoTo High Concurrency Checkout Optimization',
        slug: 'goto-high-concurrency-checkout',
        summary: 'Rancang ulang sistem checkout untuk menangani 50.000 transaksi per detik selama flash sale.',
        description: '### Deskripsi Masalah\nSelama flash sale 12.12, sistem mengalami lonjakan latensi pada layanan inventaris dan pembayaran. Kandidat ditantang untuk membangun purwarupa checkout menggunakan Redis caching dan antrean pesan asinkron (RabbitMQ/Kafka).\n\n### Kriteria Sukses\n- Latensi di bawah 50ms (p99).\n- Pencegahan *over-selling* / *race condition* 100% akurat.\n- Integrasi unit test minimal 85%.',
        category: ChallengeCategory.BACKEND,
        difficulty: ChallengeDifficulty.SENIOR,
        rubric: {
          code_cleanliness: 35, system_scalability: 40, test_coverage: 25, durationHours: 48, requireProctoring: true, examMode: 'STRICT',
          customOutputs: [{ id: 'load_test_report', label: 'Tautan Laporan Uji Beban (Grafana / k6 / JMeter HTML)', placeholder: 'https://storage.tolongin.co/reports/load-test.pdf', required: true }]
        },
        reward: 'Jalur Cepat Wawancara Final & Relokasi Bonus Rp 25 Juta',
        briefAttachments: [
          { type: 'image', url: 'https://placehold.co/800x400/10b981/ffffff?text=Architecture+Diagram', caption: 'High-Level System Architecture' },
          { type: 'document', url: 'https://docs.google.com/document/d/example-load-test', label: 'Spesifikasi Uji Beban (PDF)' }
        ]
      },
      {
        companyEmail: 'hr@traveloka.com',
        title: 'Traveloka Seamless Flight Booking Experience',
        slug: 'traveloka-flight-booking-redesign',
        summary: 'Desain antarmuka pemesanan tiket pesawat yang super intuitif untuk pengguna lanjut usia dan gen-Z.',
        description: '### Latar Belakang\nPemesanan penerbangan multi-kota sering kali membingungkan. Kami membutuhkan desain ulang pada alur pencarian, pemilihan kursi, hingga pembayaran yang mengedepankan prinsip aksesibilitas.\n\n### Target Pencapaian\n- Wireframe dan High-Fidelity Prototype di Figma.\n- Memenuhi standar kontras warna WCAG AAA.\n- Mengurangi langkah pemesanan dari 7 tahapan menjadi maksimal 4 tahapan.',
        category: ChallengeCategory.UI_UX,
        difficulty: ChallengeDifficulty.MEDIOR,
        rubric: {
          ux_research: 30, visual_hierarchy: 40, accessibility: 30, durationHours: 72, requireProctoring: false, examMode: 'CREATIVE',
          customOutputs: [
            { id: 'figma_proto', label: 'Tautan Prototipe Interaktif (Figma)', placeholder: 'https://figma.com/proto/...', required: true },
            { id: 'usability_report', label: 'Laporan Usability Testing', placeholder: 'https://docs.google.com/document/d/...', required: true }
          ]
        },
        reward: 'MacBook Pro M3 & Undangan Langsung Onsite Interview',
        briefAttachments: [
          { type: 'video', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', title: 'User Research Interview Footage' },
          { type: 'image', url: 'https://placehold.co/800x400/3b82f6/ffffff?text=Traveloka+Design+System', caption: 'Traveloka Design System v3' }
        ]
      },
      {
        companyEmail: 'hr@efishery.com',
        title: 'eFishery Real-time IoT Feeder Dashboard',
        slug: 'efishery-iot-dashboard-nextjs',
        summary: 'Bangun dasbor analitik responsif untuk memonitor ribuan perangkat pakan ikan otomatis.',
        description: '### Kebutuhan Sistem\nPetambak ikan membutuhkan dasbor real-time untuk memantau sisa pakan, kualitas air, dan jadwal pemberian makan. Anda diminta membangun aplikasi frontend web menggunakan Next.js dan Tailwind CSS.\n\n### Fitur Utama\n- Visualisasi grafik interaktif (menggunakan Recharts atau Chart.js).\n- State management yang efisien tanpa re-render berlebih.\n- Responsif penuh di perangkat seluler.',
        category: ChallengeCategory.FRONTEND,
        difficulty: ChallengeDifficulty.JUNIOR,
        rubric: {
          responsiveness: 35, state_management: 35, code_quality: 30, durationHours: 36, requireProctoring: false, examMode: 'CREATIVE',
          customOutputs: [{ id: 'bundle_analysis', label: 'Tautan Laporan Analisis Bundle', placeholder: 'https://storage.tolongin.co/reports/bundle.json', required: false }]
        },
        reward: 'Gaji Kompetitif + Stock Options eFishery',
        briefAttachments: [
          { type: 'image', url: 'https://placehold.co/600x600/10b981/ffffff?text=IoT+Feeder+Device', caption: 'eFishery Feeder Device IoT' },
          { type: 'link', url: 'https://recharts.org', label: 'Referensi Dokumentasi Recharts' }
        ]
      },
      {
        companyEmail: 'hr@traveloka.com',
        title: 'Gen-Z Viral Marketing Campaign Strategy',
        slug: 'traveloka-growth-viral-campaign',
        summary: 'Rancang kampanye pemasaran digital komprehensif untuk mempromosikan fitur PayLater liburan.',
        description: '### Rumusan Masalah\nBagaimana meningkatkan adopsi Traveloka PayLater di kalangan profesional muda tanpa memicu kredit macet? Rancang strategi konten TikTok/Reels, perhitungan CAC/LTV, dan mekanik referral viral.\n\n### Deliverables\n- Dek presentasi strategi pemasaran (PDF/Slide).\n- Rincian alokasi anggaran (Budget Plan).\n- Rencana mitigasi risiko reputasi merek.',
        category: ChallengeCategory.MARKETING,
        difficulty: ChallengeDifficulty.MEDIOR,
        rubric: {
          creativity: 40, financial_feasibility: 35, viral_mechanic: 25, durationHours: 72, requireProctoring: false, examMode: 'CREATIVE',
          customOutputs: [
            { id: 'pitch_deck', label: 'Slide Strategi Kampanye', placeholder: 'https://canva.com/design/...', required: true },
            { id: 'media_plan', label: 'Rancangan Anggaran & Media Plan', placeholder: 'https://docs.google.com/spreadsheets/d/...', required: true },
          ]
        },
        reward: 'Kontrak Eksklusif Marketing Lead + Liburan Gratis ke Jepang',
        briefAttachments: [
          { type: 'video', url: 'https://www.youtube.com/embed/tgbNymZ7vqY', title: 'Contoh Kampanye Viral Sebelumnya' },
          { type: 'document', url: 'https://docs.google.com/document/d/guideline', label: 'Panduan Merek Traveloka & Tone of Voice' }
        ]
      },
      {
        talentEmail: 'budi.developer@gmail.com',
        type: 'PUBLIC',
        title: 'Open Source - Bikin API Rate Limiter Sederhana dengan Redis',
        slug: 'public-api-rate-limiter',
        summary: 'Tantangan santai dari Budi: Bikin rate limiter untuk public API biar ga gampang diserang DDoS, pakai Redis dan Node.js.',
        description: '### Deskripsi\nHalo! Ini public challenge pertama dari saya. Coba bikin sistem Rate Limiter sederhana. Jika request melebihi 100/menit per IP, blokir sementara dan kembalikan 429 Too Many Requests.\n\n### Kriteria Sukses\n- Menggunakan Redis untuk memory store.\n- Middleware berfungsi di Express / NestJS.',
        category: ChallengeCategory.BACKEND,
        difficulty: ChallengeDifficulty.JUNIOR,
        rubric: {
          code_cleanliness: 50, system_scalability: 50, durationHours: 24, requireProctoring: false, examMode: 'CREATIVE',
          customOutputs: []
        },
        reward: '50 Token dari Sistem Tolongin',
        briefAttachments: []
      }
    ];

    const challengeEntities: Record<string, any> = {};
    for (const ch of challengesData) {
      if (ch.type === 'PUBLIC') {
        const talent = talentProfiles[ch.talentEmail!];
        challengeEntities[ch.slug] = await this.prisma.challenge.upsert({
          where: { slug: ch.slug },
          create: {
            talentId: talent.id, title: ch.title, slug: ch.slug, summary: ch.summary, description: ch.description,
            category: ch.category, difficulty: ch.difficulty, gradingRubric: ch.rubric, status: ChallengeStatus.PUBLISHED,
            rewardDescription: ch.reward, deadlineAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), briefAttachments: ch.briefAttachments,
            challengeType: 'PUBLIC',
          },
          update: {
            title: ch.title, summary: ch.summary, description: ch.description, category: ch.category,
            difficulty: ch.difficulty, gradingRubric: ch.rubric, rewardDescription: ch.reward, briefAttachments: ch.briefAttachments,
            challengeType: 'PUBLIC',
          },
        });
      } else {
        const comp = companyProfiles[ch.companyEmail!];
        challengeEntities[ch.slug] = await this.prisma.challenge.upsert({
          where: { slug: ch.slug },
          create: {
            companyId: comp.id, title: ch.title, slug: ch.slug, summary: ch.summary, description: ch.description,
            category: ch.category, difficulty: ch.difficulty, gradingRubric: ch.rubric, status: ChallengeStatus.PUBLISHED,
            rewardDescription: ch.reward, deadlineAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), briefAttachments: ch.briefAttachments,
            challengeType: 'COMPANY',
          },
          update: {
            title: ch.title, summary: ch.summary, description: ch.description, category: ch.category,
            difficulty: ch.difficulty, gradingRubric: ch.rubric, rewardDescription: ch.reward, briefAttachments: ch.briefAttachments,
            challengeType: 'COMPANY',
          },
        });
      }
    }

    // 5. Buat Riwayat Diskusi / Q&A
    const discussionsSample = [
      { challengeSlug: 'goto-high-concurrency-checkout', talentEmail: 'budi.developer@gmail.com', message: 'Apakah diperbolehkan menggunakan skema sharding pada PostgreSQL untuk tantangan ini?' },
      { challengeSlug: 'traveloka-flight-booking-redesign', talentEmail: 'siti.designer@gmail.com', message: 'Apakah ada pedoman merek (brand guideline) resmi terkait penggunaan warna sekunder Traveloka?' },
      { challengeSlug: 'traveloka-growth-viral-campaign', talentEmail: 'joko.marketing@gmail.com', message: 'Berapa batas anggaran maksimal untuk influencer Tier A?' },
    ];

    for (const d of discussionsSample) {
      const ch = challengeEntities[d.challengeSlug];
      const user = await this.prisma.user.findUnique({ where: { email: d.talentEmail } });
      if (ch && user) {
        const exist = await this.prisma.discussion.findFirst({ where: { challengeId: ch.id, userId: user.id } });
        if (!exist) await this.prisma.discussion.create({ data: { challengeId: ch.id, userId: user.id, message: d.message } });
      }
    }

    // 6. Buat Enrollment, Submission, dan Portfolio
    const submissionsData = [
      {
        talentEmail: 'budi.developer@gmail.com', challengeSlug: 'goto-high-concurrency-checkout', repoUrl: 'https://github.com/budiraharjo/goto-checkout-solution', demoUrl: 'https://goto-checkout-budi.vercel.app',
        notes: 'Menggunakan Redis Redlock dan BullMQ untuk antrean pesanan yang persisten dan idempotensi transaksi.', aiPlagScore: 0.2, aiScore: 94.5,
        aiSummary: 'AI Assessment: Struktur kode luar biasa. Implementasi distributed lock bekerja sempurna tanpa deadlock.', finalScore: 96.0,
        feedback: 'Solusi paling elegan yang pernah kami lihat di batch ini. Selamat!', status: SubmissionStatus.PASSED, hiring: HiringStatus.INTERVIEW_INVITED,
        summary: 'Optimalisasi Checkout GoTo Flash Sale (96/100). Latensi p99 23ms, 0% race condition.', badgeTitle: 'Problem Solver Elite',
      },
      {
        talentEmail: 'siti.designer@gmail.com', challengeSlug: 'traveloka-flight-booking-redesign', figmaUrl: 'https://figma.com/file/traveloka-redesign-siti', demoUrl: 'https://traveloka-redesign-siti.vercel.app',
        notes: 'Prototipe mencakup alur pemesanan dengan mode kontras tinggi dan pembaca layar otomatis.', aiPlagScore: 0.0, aiScore: 92.0,
        aiSummary: 'AI Assessment: Desain memiliki kontras warna 4.5:1 yang memenuhi standar WCAG AAA. Navigasi sangat intuitif.', finalScore: 92.0,
        feedback: 'Riset pengguna sangat mendalam dan presentasi visual memukau. Kami ingin mengundang Anda ke kantor.', status: SubmissionStatus.PASSED, hiring: HiringStatus.SHORTLISTED,
        summary: 'Desain Ulang Pengalaman Pemesanan Tiket Penerbangan Traveloka (92/100).', badgeTitle: 'UI/UX Visionary',
      },
      {
        talentEmail: 'agus.frontend@gmail.com', challengeSlug: 'efishery-iot-dashboard-nextjs', repoUrl: 'https://github.com/agussetiawan/efishery-dashboard', demoUrl: 'https://efishery-iot-agus.vercel.app',
        notes: 'Menggunakan Zustand untuk state lokal dan Recharts dengan Web Worker untuk rendering 10,000 titik data.', aiPlagScore: 1.1, aiScore: 89.0,
        aiSummary: 'AI Assessment: Kinerja rendering 60 FPS stabil. Penggunaan memoization pada komponen tabel sangat tepat.', finalScore: 88.0,
        feedback: 'Kode sangat bersih dan mengikuti konvensi Next.js terbaru. Pekerjaan yang hebat!', status: SubmissionStatus.PASSED, hiring: HiringStatus.SHORTLISTED,
        summary: 'Dasbor Analitik Real-time Feeder IoT eFishery (88/100). Kinerja 100% Lighthouse.', badgeTitle: 'Architect of the Future',
      },
      {
        talentEmail: 'joko.marketing@gmail.com', challengeSlug: 'traveloka-growth-viral-campaign', repoUrl: '', figmaUrl: '', demoUrl: 'https://docs.google.com/presentation/d/joko-marketing',
        notes: 'Memanfaatkan tren short-video dan program afiliasi Gen-Z.', aiPlagScore: 0.5, aiScore: 85.5,
        aiSummary: 'AI Assessment: Strategi media sangat rinci dan ROI dihitung dengan margin of error 5%.', finalScore: null,
        feedback: null, status: SubmissionStatus.UNDER_REVIEW, hiring: HiringStatus.NONE,
        summary: null, badgeTitle: 'Creative Marketing Genius',
      },
    ];

    for (const sub of submissionsData) {
      const talent = talentProfiles[sub.talentEmail];
      const challenge = challengeEntities[sub.challengeSlug];
      if (!talent || !challenge) continue;

      let enroll = await this.prisma.challengeEnrollment.findUnique({ where: { talentId_challengeId: { talentId: talent.id, challengeId: challenge.id } } });
      if (!enroll) {
        enroll = await this.prisma.challengeEnrollment.create({
          data: {
            talentId: talent.id, challengeId: challenge.id,
            status: sub.status === SubmissionStatus.PASSED ? EnrollmentStatus.EVALUATED : EnrollmentStatus.SUBMITTED,
            ndaSignedAt: new Date(), startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          },
        });
      }

      let submission = await this.prisma.submission.findFirst({ where: { enrollmentId: enroll.id } });
      if (!submission) {
        submission = await this.prisma.submission.create({
          data: {
            enrollmentId: enroll.id, talentId: talent.id, challengeId: challenge.id, repositoryUrl: sub.repoUrl, figmaUrl: sub.figmaUrl, liveDemoUrl: sub.demoUrl, notes: sub.notes,
            aiPlagiarismScore: sub.aiPlagScore, aiScore: sub.aiScore, aiCorrectionSummary: sub.aiSummary, finalScore: sub.finalScore, reviewerFeedback: sub.feedback,
            status: sub.status, hiringStatus: sub.hiring, evaluatedAt: sub.finalScore ? new Date() : null,
          },
        });
      } else {
        await this.prisma.submission.update({
          where: { id: submission.id },
          data: { aiScore: sub.aiScore, finalScore: sub.finalScore, status: sub.status }
        });
      }

      if (sub.status === SubmissionStatus.PASSED && sub.summary) {
        await this.prisma.portfolio.upsert({
          where: { submissionId: submission.id },
          create: { talentId: talent.id, submissionId: submission.id, showcaseSummary: sub.summary, verifiedBadgeUrl: 'https://placehold.co/200x200/10b981/ffffff?text=Verified' },
          update: { showcaseSummary: sub.summary, verifiedBadgeUrl: 'https://placehold.co/200x200/10b981/ffffff?text=Verified' },
        });

        if (sub.badgeTitle) {
          const badge = await this.prisma.badge.findUnique({ where: { title: sub.badgeTitle } });
          if (badge) {
            const hasBadge = await this.prisma.talentBadge.findUnique({ where: { talentId_badgeId: { talentId: talent.id, badgeId: badge.id } } });
            if (!hasBadge) await this.prisma.talentBadge.create({ data: { talentId: talent.id, badgeId: badge.id } });
          }
        }
      }
    }

    this.logger.log('Seeding data sampel selesai dengan sukses!');
    return { success: true, message: 'Database telah diisi dengan data sampel lengkap (termasuk fitur baru briefAttachments, LMS Fleksibel, AI).' };
  }
}
