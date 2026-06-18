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
  ComponentType
} from '@prisma/client';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seed() {
    this.logger.log('Memulai proses seeding data sampel yang sangat lengkap...');

    // Hapus semua data yang ada menggunakan eksekusi SQL (CASCADE)
    this.logger.log('Menjalankan SQL untuk menghapus semua data yang ada (TRUNCATE CASCADE)...');
    try {
      await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE "users" CASCADE;`);
      await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE "badges" CASCADE;`);
      await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE "challenges" CASCADE;`);
      this.logger.log('Semua data berhasil dihapus.');
    } catch (error) {
      this.logger.warn('Gagal melakukan truncate, mencoba deleteMany fallback...');
      await this.prisma.user.deleteMany();
      await this.prisma.badge.deleteMany();
      await this.prisma.challenge.deleteMany();
    }

    const saltRounds = 10;
    const defaultPassword = await bcrypt.hash('password123', saltRounds);

    // 1. Buat Badges Gamifikasi
    const badges = [
      { title: 'Problem Solver Elite', description: 'Menyelesaikan tantangan algoritma dengan efisiensi O(1) atau O(N).', iconUrl: 'https://placehold.co/100x100/10b981/ffffff?text=Elite', requiredXp: 100 },
      { title: 'Architect of the Future', description: 'Desain arsitektur mikroservis tanpa cacat di bawah beban tinggi.', iconUrl: 'https://placehold.co/100x100/10b981/ffffff?text=Arch', requiredXp: 250 },
      { title: 'UI/UX Visionary', description: 'Mencapai skor aksesibilitas dan UX 100% pada evaluasi AI.', iconUrl: 'https://placehold.co/100x100/10b981/ffffff?text=UX', requiredXp: 150 },
      { title: 'Data Alchemist', description: 'Membangun model AI dengan akurasi prediksi p99 di atas 95%.', iconUrl: 'https://placehold.co/100x100/10b981/ffffff?text=Data', requiredXp: 200 },
      { title: 'Bug Squasher', description: 'Menemukan dan memperbaiki 50+ bug kritis.', iconUrl: 'https://placehold.co/100x100/ef4444/ffffff?text=BugSq', requiredXp: 300 },
    ];

    for (const b of badges) {
      await this.prisma.badge.upsert({ where: { title: b.title }, create: b, update: b });
    }

    // 2. Buat Akun Perusahaan
    const companyUsersData = [
      { email: 'hr@goto.com', companyName: 'GoTo Group', industry: 'Tech', subscriptionTier: SubscriptionTier.KONGLOMERAT, companySize: '10,000+', logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=GoTo' },
      { email: 'hr@traveloka.com', companyName: 'Traveloka', industry: 'Travel', subscriptionTier: SubscriptionTier.KONGLOMERAT, companySize: '5,000+', logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Traveloka' },
      { email: 'hr@efishery.com', companyName: 'eFishery', industry: 'Agritech', subscriptionTier: SubscriptionTier.STARTUP, companySize: '1,000+', logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=eFishery' },
      { email: 'hr@ruangguru.com', companyName: 'Ruangguru', industry: 'EdTech', subscriptionTier: SubscriptionTier.STARTUP, companySize: '1,000+', logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Ruangguru' },
      { email: 'hr@bca.co.id', companyName: 'BCA', industry: 'Banking', subscriptionTier: SubscriptionTier.CUSTOM, companySize: '20,000+', logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=BCA' },
    ];

    const companyProfiles: Record<string, any> = {};
    for (const c of companyUsersData) {
      const user = await this.prisma.user.create({
        data: { email: c.email, passwordHash: defaultPassword, role: Role.COMPANY, isVerified: true },
      });
      companyProfiles[c.email] = await this.prisma.companyProfile.create({
        data: {
          userId: user.id, companyName: c.companyName, industry: c.industry, subscriptionTier: c.subscriptionTier,
          kybStatus: VerificationStatus.VERIFIED, logoUrl: c.logoUrl, companySize: c.companySize, trustScore: 100,
        },
      });
    }

    // 3. Buat Akun Talenta (20 Talenta)
    const talentNames = [
      'Budi Raharjo', 'Siti Aminah', 'Agus Setiawan', 'Dewi Lestari', 'Joko Anwar',
      'Rio Dewanto', 'Susan Susanti', 'Andi Saputra', 'Rini Wulandari', 'Doni Pratama',
      'Maya Sari', 'Hendra Wijaya', 'Tina Toon', 'Galih Rakasiwi', 'Diana Pungky',
      'Reza Rahadian', 'Citra Kirana', 'Bayu Skak', 'Putri Marino', 'Arif Muhammad'
    ];

    const talentProfilesMap: Record<string, any> = {};
    const allTalentIds: string[] = [];

    for (let i = 0; i < talentNames.length; i++) {
      const name = talentNames[i];
      const email = `${name.toLowerCase().replace(/ /g, '.')}@gmail.com`;
      const user = await this.prisma.user.create({
        data: { email, passwordHash: defaultPassword, role: Role.TALENT, isVerified: true },
      });
      const profile = await this.prisma.talentProfile.create({
        data: {
          userId: user.id, fullName: name, headline: 'Software Engineer', skills: ['Javascript', 'React', 'Node.js'],
          faceVerificationStatus: VerificationStatus.VERIFIED, xp: Math.floor(Math.random() * 5000) + 1000,
          level: Math.floor(Math.random() * 30) + 10, avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name.split(' ')[0]}`,
          tokenBalance: 500,
        },
      });
      talentProfilesMap[email] = profile;
      allTalentIds.push(profile.id);
    }

    // 4. Create Master Challenge (All Components)
    this.logger.log('Creating Master Challenge (Fullstack Assessment)...');
    const masterChallenge = await this.prisma.challenge.create({
      data: {
        companyId: companyProfiles['hr@goto.com'].id,
        title: 'Ultimate Fullstack Assessment',
        slug: 'goto-ultimate-fullstack-assessment',
        summary: 'Ujian komprehensif untuk posisi Senior Fullstack Engineer. Termasuk live coding, algoritma, presentasi, dan esai.',
        description: `### Deskripsi Tantangan\nKami mencari seorang Senior Fullstack Engineer yang mampu berpikir secara holistik. Ujian ini dirancang untuk menguji seluruh aspek keahlian Anda: dari struktur data hingga cara Anda mempresentasikan solusi teknis.\n\n### Persyaratan:\n- Penggunaan pola arsitektur yang efisien.\n- Video presentasi arsitektur tidak lebih dari 5 menit.\n- Kode harus lolos evaluasi otomatis AI.`,
        category: ChallengeCategory.BACKEND,
        difficulty: ChallengeDifficulty.SENIOR,
        status: ChallengeStatus.PUBLISHED,
        gradingRubric: { logic: 40, presentation: 30, best_practices: 30 },
        rewardDescription: 'MacBook Pro M3 Max + Tawaran C-Level',
        deadlineAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }
    });

    const optId1 = 'opt_1';
    const optId2 = 'opt_2';
    const optId3 = 'opt_3';
    const optId4 = 'opt_4';

    const components = await Promise.all([
      // 1. Multiple Choice
      this.prisma.challengeComponent.create({
        data: {
          challengeId: masterChallenge.id, type: ComponentType.MULTIPLE_CHOICE, order: 1, points: 10,
          question: 'Manakah dari struktur data berikut yang memberikan kompleksitas waktu pencarian rata-rata O(1)?',
          options: [
            { id: optId1, text: 'Binary Search Tree', isCorrect: false },
            { id: optId2, text: 'Hash Table', isCorrect: true },
            { id: optId3, text: 'Linked List', isCorrect: false },
            { id: optId4, text: 'Balanced AVL Tree', isCorrect: false }
          ]
        }
      }),
      // 2. Essay
      this.prisma.challengeComponent.create({
        data: {
          challengeId: masterChallenge.id, type: ComponentType.ESSAY, order: 2, points: 20,
          question: 'Jelaskan pendekatan Anda dalam mengatasi masalah "Thundering Herd" pada layanan berbasis microservices yang mengandalkan Redis Cache.',
        }
      }),
      // 3. Live Coding
      this.prisma.challengeComponent.create({
        data: {
          challengeId: masterChallenge.id, type: ComponentType.LIVE_CODING, order: 3, points: 40,
          question: 'Implementasikan fungsi debounce dalam Javascript tanpa menggunakan library eksternal (Lodash, dsb).',
          metadata: { language: 'javascript' }
        }
      }),
      // 4. File Upload
      this.prisma.challengeComponent.create({
        data: {
          challengeId: masterChallenge.id, type: ComponentType.FILE_UPLOAD, order: 4, points: 15,
          question: 'Unggah berkas PDF berisi arsitektur sistem level tinggi (HLD) untuk platform E-Commerce berskala jutaan DAU.',
          description: 'Max 10MB, format .pdf'
        }
      }),
      // 5. Video Upload
      this.prisma.challengeComponent.create({
        data: {
          challengeId: masterChallenge.id, type: ComponentType.VIDEO_UPLOAD, order: 5, points: 15,
          question: 'Rekam video penjelasan singkat (maks 3 menit) mengenai pilihan teknologi pada HLD yang Anda unggah sebelumnya.',
          description: 'Format .mp4, Max 25MB'
        }
      })
    ]);

    // Generate 20 distinct submissions for the Master Challenge
    this.logger.log('Generating 20 submissions for Master Challenge...');
    let passedCount = 0;

    for (let i = 0; i < allTalentIds.length; i++) {
      const talentId = allTalentIds[i];
      const isPass = Math.random() > 0.4; // 60% pass rate
      const subStatus = isPass ? SubmissionStatus.PASSED : (Math.random() > 0.5 ? SubmissionStatus.FAILED : SubmissionStatus.UNDER_REVIEW);
      const finalScore = isPass ? Math.floor(Math.random() * 20 + 80) : Math.floor(Math.random() * 30 + 40);

      const enrollment = await this.prisma.challengeEnrollment.create({
        data: {
          talentId, challengeId: masterChallenge.id, status: EnrollmentStatus.EVALUATED,
          startedAt: new Date(Date.now() - Math.floor(Math.random() * 5) * 24 * 3600000),
          completedAt: new Date(Date.now() - Math.floor(Math.random() * 2) * 24 * 3600000),
        }
      });

      const aiSummary = isPass ? 
        'Kandidat menunjukkan pemahaman mendalam tentang struktur data dan implementasi live coding yang sempurna. Penjelasan esai sangat teknis dan tepat sasaran.' : 
        'Kandidat gagal memberikan solusi O(1) yang efisien, dan live coding mengandung bug kritis. Penjelasan video kurang komprehensif.';

      const submission = await this.prisma.submission.create({
        data: {
          enrollmentId: enrollment.id, talentId, challengeId: masterChallenge.id,
          status: subStatus, finalScore, aiScore: finalScore - Math.floor(Math.random() * 5),
          aiCorrectionSummary: aiSummary,
          reviewerFeedback: isPass ? 'Sangat mengesankan. Kami akan menjadwalkan wawancara segera.' : 'Masih butuh latihan dasar struktur data.',
          hiringStatus: isPass ? HiringStatus.SHORTLISTED : HiringStatus.REJECTED,
          evaluatedAt: new Date(),
        }
      });

      if (isPass) passedCount++;

      // Create Component Responses
      // 1. Multiple Choice
      await this.prisma.componentResponse.create({
        data: {
          submissionId: submission.id, componentId: components[0].id,
          textValue: isPass ? optId2 : (Math.random() > 0.5 ? optId1 : optId3),
          score: isPass ? 10 : 0
        }
      });

      // 2. Essay
      const essayGood = [
        "Thundering Herd terjadi ketika banyak proses/thread terbangun bersamaan untuk memperebutkan sumber daya. Cara mengatasinya adalah dengan menggunakan mekanisme penguncian (lock) seperti Redlock pada Redis, sehingga hanya satu thread yang melakukan query ke database dan yang lain menunggu.",
        "Untuk mencegah Thundering Herd, saya menerapkan Jitter/Randomized TTL pada Redis cache untuk mencegah kadaluarsa massal secara simultan, dan menerapkan Mutex Lock saat regenerasi cache."
      ];
      const essayBad = [
        "Thundering Herd itu masalah server lambat. Solusinya ya ditambah RAM servernya.",
        "Saya tidak tahu pastinya, tapi mungkin dengan me-restart Redis."
      ];
      await this.prisma.componentResponse.create({
        data: {
          submissionId: submission.id, componentId: components[1].id,
          textValue: isPass ? essayGood[Math.floor(Math.random() * essayGood.length)] : essayBad[Math.floor(Math.random() * essayBad.length)],
          score: isPass ? 18 : 5
        }
      });

      // 3. Live Coding
      const debounceGood = `function debounce(func, wait) {\n  let timeout;\n  return function executedFunction(...args) {\n    const later = () => {\n      clearTimeout(timeout);\n      func(...args);\n    };\n    clearTimeout(timeout);\n    timeout = setTimeout(later, wait);\n  };\n}`;
      const debounceBad = `function debounce(func) {\n  setTimeout(() => func(), 1000);\n}`;
      await this.prisma.componentResponse.create({
        data: {
          submissionId: submission.id, componentId: components[2].id,
          textValue: isPass ? debounceGood : debounceBad,
          score: isPass ? 40 : 10
        }
      });

      // 4. File Upload
      await this.prisma.componentResponse.create({
        data: {
          submissionId: submission.id, componentId: components[3].id,
          fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          score: isPass ? 15 : 5
        }
      });

      // 5. Video
      await this.prisma.componentResponse.create({
        data: {
          submissionId: submission.id, componentId: components[4].id,
          fileUrl: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
          score: isPass ? 12 : 5
        }
      });
    }

    // 5. Create Other Varied Challenges
    this.logger.log('Creating other varied challenges...');
    
    // Multiple Choice Only Challenge
    const mcqChallenge = await this.prisma.challenge.create({
      data: {
        companyId: companyProfiles['hr@efishery.com'].id,
        title: 'Basic Frontend Concepts', slug: 'efishery-basic-frontend',
        summary: 'Uji pemahaman dasar tentang HTML, CSS, dan reaktivitas di web.',
        description: 'Tantangan ini hanya terdiri dari soal pilihan ganda murni. Silakan kerjakan dengan cermat.',
        category: ChallengeCategory.FRONTEND, difficulty: ChallengeDifficulty.JUNIOR,
        status: ChallengeStatus.PUBLISHED, gradingRubric: { concept: 100 },
      }
    });
    await this.prisma.challengeComponent.create({
      data: { challengeId: mcqChallenge.id, type: ComponentType.MULTIPLE_CHOICE, question: 'Apa singkatan dari DOM?', options: [ { id: 'o1', text: 'Document Object Model', isCorrect: true }, { id: 'o2', text: 'Data Object Model', isCorrect: false } ] }
    });

    // Essay & File Upload Challenge
    const designChallenge = await this.prisma.challenge.create({
      data: {
        companyId: companyProfiles['hr@ruangguru.com'].id,
        title: 'Product Design Case Study', slug: 'ruangguru-product-design',
        summary: 'Selesaikan studi kasus desain produk interaktif untuk platform edukasi.',
        description: 'Jawab esai mengenai riset pengguna Anda dan lampirkan hasil rancangan low-fidelity.',
        category: ChallengeCategory.UI_UX, difficulty: ChallengeDifficulty.MEDIOR,
        status: ChallengeStatus.PUBLISHED, gradingRubric: { research: 50, design: 50 },
      }
    });
    await this.prisma.challengeComponent.create({
      data: { challengeId: designChallenge.id, type: ComponentType.ESSAY, question: 'Jelaskan pain points utama siswa saat belajar online berdasarkan riset Anda.', points: 50 }
    });
    await this.prisma.challengeComponent.create({
      data: { challengeId: designChallenge.id, type: ComponentType.FILE_UPLOAD, question: 'Unggah file wireframe/prototype Anda (.pdf atau .png)', points: 50 }
    });

    // Legacy Style Challenge (Only URL and Description)
    await this.prisma.challenge.create({
      data: {
        companyId: companyProfiles['hr@bca.co.id'].id,
        title: 'Banking Backend Architecture', slug: 'bca-banking-architecture',
        summary: 'Tugas arsitektur tanpa komponen khusus (Legacy style).',
        description: 'Buatlah repo GitHub yang memuat API banking sederhana menggunakan Spring Boot atau NestJS. Kumpulkan tautan GitHub Anda di kolom yang tersedia (Tautan Repositori).',
        category: ChallengeCategory.BACKEND, difficulty: ChallengeDifficulty.SENIOR,
        status: ChallengeStatus.PUBLISHED, gradingRubric: { security: 60, architecture: 40 },
      }
    });

    this.logger.log(`Seeding data sampel selesai! Dihasilkan ${passedCount} kandidat lulus untuk Master Challenge.`);
    return { success: true, message: 'Database telah diisi dengan data sampel lengkap setelah di-truncate.' };
  }
}
