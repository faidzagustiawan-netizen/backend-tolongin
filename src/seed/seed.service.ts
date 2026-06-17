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
    this.logger.log('Memulai proses seeding data sampel yang lengkap...');

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

    // 1. Buat Badges Gamifikasi (10 Badges)
    const badges = [
      { title: 'Problem Solver Elite', description: 'Menyelesaikan tantangan algoritma dengan efisiensi O(1) atau O(N).', iconUrl: 'https://placehold.co/100x100/10b981/ffffff?text=Elite', requiredXp: 100 },
      { title: 'Architect of the Future', description: 'Desain arsitektur mikroservis tanpa cacat di bawah beban tinggi.', iconUrl: 'https://placehold.co/100x100/10b981/ffffff?text=Arch', requiredXp: 250 },
      { title: 'UI/UX Visionary', description: 'Mencapai skor aksesibilitas dan UX 100% pada evaluasi AI.', iconUrl: 'https://placehold.co/100x100/10b981/ffffff?text=UX', requiredXp: 150 },
      { title: 'Data Alchemist', description: 'Membangun model AI dengan akurasi prediksi p99 di atas 95%.', iconUrl: 'https://placehold.co/100x100/10b981/ffffff?text=Data', requiredXp: 200 },
      { title: 'Creative Marketing Genius', description: 'Menghasilkan strategi viral dengan proyeksi ROI di atas 300%.', iconUrl: 'https://placehold.co/100x100/10b981/ffffff?text=Mktg', requiredXp: 150 },
      { title: 'Bug Squasher', description: 'Menemukan dan memperbaiki 50+ bug kritis.', iconUrl: 'https://placehold.co/100x100/ef4444/ffffff?text=BugSq', requiredXp: 300 },
      { title: 'DevOps Master', description: 'Mencapai zero-downtime deployment pada 10+ proyek.', iconUrl: 'https://placehold.co/100x100/3b82f6/ffffff?text=DevOps', requiredXp: 300 },
      { title: 'Mobile Guru', description: 'Membangun aplikasi mobile dengan rating 4.9+ di App Store.', iconUrl: 'https://placehold.co/100x100/8b5cf6/ffffff?text=Mobile', requiredXp: 250 },
      { title: 'Security Sentinel', description: 'Menemukan kerentanan sistem tingkat tinggi.', iconUrl: 'https://placehold.co/100x100/f59e0b/ffffff?text=Sec', requiredXp: 400 },
      { title: 'QA Champion', description: 'Memiliki test coverage 100% pada semua pengiriman.', iconUrl: 'https://placehold.co/100x100/14b8a6/ffffff?text=QA', requiredXp: 200 },
    ];

    for (const b of badges) {
      await this.prisma.badge.upsert({ where: { title: b.title }, create: b, update: b });
    }

    // 2. Buat Akun Perusahaan (10 Perusahaan)
    const companyUsersData = [
      { email: 'hr@goto.com', companyName: 'GoTo Group', industry: 'Tech', subscriptionTier: SubscriptionTier.KONGLOMERAT, companySize: '10,000+', logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=GoTo' },
      { email: 'hr@traveloka.com', companyName: 'Traveloka', industry: 'Travel', subscriptionTier: SubscriptionTier.KONGLOMERAT, companySize: '5,000+', logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Traveloka' },
      { email: 'hr@efishery.com', companyName: 'eFishery', industry: 'Agritech', subscriptionTier: SubscriptionTier.STARTUP, companySize: '1,000+', logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=eFishery' },
      { email: 'hr@shopee.com', companyName: 'Shopee', industry: 'E-Commerce', subscriptionTier: SubscriptionTier.KONGLOMERAT, companySize: '10,000+', logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Shopee' },
      { email: 'hr@grab.com', companyName: 'Grab', industry: 'Tech', subscriptionTier: SubscriptionTier.CUSTOM, companySize: '10,000+', logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Grab' },
      { email: 'hr@bukalapak.com', companyName: 'Bukalapak', industry: 'E-Commerce', subscriptionTier: SubscriptionTier.KONGLOMERAT, companySize: '2,000+', logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Bukalapak' },
      { email: 'hr@ruangguru.com', companyName: 'Ruangguru', industry: 'EdTech', subscriptionTier: SubscriptionTier.STARTUP, companySize: '1,000+', logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Ruangguru' },
      { email: 'hr@bca.co.id', companyName: 'BCA', industry: 'Banking', subscriptionTier: SubscriptionTier.CUSTOM, companySize: '20,000+', logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=BCA' },
      { email: 'hr@telkomsel.com', companyName: 'Telkomsel', industry: 'Telecommunications', subscriptionTier: SubscriptionTier.KONGLOMERAT, companySize: '5,000+', logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Telkomsel' },
      { email: 'hr@tiket.com', companyName: 'Tiket.com', industry: 'Travel', subscriptionTier: SubscriptionTier.STARTUP, companySize: '1,000+', logoUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Tiket' },
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
          kybStatus: VerificationStatus.VERIFIED, logoUrl: c.logoUrl, companySize: c.companySize, trustScore: 100,
        },
        update: { companyName: c.companyName, industry: c.industry, subscriptionTier: c.subscriptionTier, logoUrl: c.logoUrl },
      });
    }

    // 3. Buat Akun Talenta (20 Talenta)
    const talentUsersData = [
      { email: 'budi.developer@gmail.com', fullName: 'Budi Raharjo', headline: 'Senior Full Stack', skills: ['NestJS', 'React', 'Backend'], xp: 9500, level: 64 },
      { email: 'siti.designer@gmail.com', fullName: 'Siti Aminah', headline: 'Lead UI/UX', skills: ['Figma', 'UI/UX'], xp: 8200, level: 56 },
      { email: 'agus.frontend@gmail.com', fullName: 'Agus Setiawan', headline: 'Next.js Expert', skills: ['Next.js', 'Frontend'], xp: 4500, level: 32 },
      { email: 'dewi.data@gmail.com', fullName: 'Dewi Lestari', headline: 'AI Engineer', skills: ['Python', 'LLM', 'Data Science'], xp: 7100, level: 48 },
      { email: 'joko.marketing@gmail.com', fullName: 'Joko Anwar', headline: 'Growth Hacker', skills: ['SEO', 'Marketing'], xp: 1200, level: 12 },
      { email: 'rio.devops@gmail.com', fullName: 'Rio Dewanto', headline: 'DevOps Engineer', skills: ['Docker', 'Kubernetes', 'AWS'], xp: 5400, level: 38 },
      { email: 'susan.qa@gmail.com', fullName: 'Susan Susanti', headline: 'QA Automation', skills: ['Cypress', 'Selenium', 'QA'], xp: 3200, level: 25 },
      { email: 'andi.mobile@gmail.com', fullName: 'Andi Saputra', headline: 'Flutter Developer', skills: ['Flutter', 'Dart', 'Mobile'], xp: 4100, level: 30 },
      { email: 'rini.product@gmail.com', fullName: 'Rini Wulandari', headline: 'Product Manager', skills: ['Agile', 'Scrum', 'Product'], xp: 6300, level: 44 },
      { email: 'doni.backend@gmail.com', fullName: 'Doni Pratama', headline: 'Go Engineer', skills: ['Golang', 'Microservices', 'Backend'], xp: 8900, level: 59 },
      { email: 'maya.frontend@gmail.com', fullName: 'Maya Sari', headline: 'Vue.js Specialist', skills: ['Vue.js', 'Nuxt.js', 'Frontend'], xp: 2100, level: 18 },
      { email: 'hendra.data@gmail.com', fullName: 'Hendra Wijaya', headline: 'Data Analyst', skills: ['SQL', 'Tableau', 'Data Science'], xp: 3500, level: 27 },
      { email: 'tina.uiux@gmail.com', fullName: 'Tina Toon', headline: 'Product Designer', skills: ['Figma', 'Prototyping', 'UI/UX'], xp: 4800, level: 34 },
      { email: 'galih.sec@gmail.com', fullName: 'Galih Rakasiwi', headline: 'Security Engineer', skills: ['Penetration Testing', 'Security'], xp: 7500, level: 51 },
      { email: 'diana.marketing@gmail.com', fullName: 'Diana Pungky', headline: 'Digital Marketing', skills: ['Google Ads', 'Marketing'], xp: 2800, level: 22 },
      { email: 'reza.fullstack@gmail.com', fullName: 'Reza Rahadian', headline: 'Full Stack Ninja', skills: ['MERN Stack', 'Backend', 'Frontend'], xp: 9100, level: 61 },
      { email: 'citra.qa@gmail.com', fullName: 'Citra Kirana', headline: 'Manual QA', skills: ['Testing', 'QA'], xp: 1500, level: 14 },
      { email: 'bayu.mobile@gmail.com', fullName: 'Bayu Skak', headline: 'iOS Developer', skills: ['Swift', 'iOS', 'Mobile'], xp: 5200, level: 36 },
      { email: 'putri.data@gmail.com', fullName: 'Putri Marino', headline: 'Machine Learning Engineer', skills: ['TensorFlow', 'Data Science'], xp: 6800, level: 46 },
      { email: 'arif.devops@gmail.com', fullName: 'Arif Muhammad', headline: 'SRE', skills: ['Terraform', 'GCP', 'DevOps'], xp: 8500, level: 57 },
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
          xp: t.xp, level: t.level, avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${t.fullName.split(' ')[0]}`,
          tokenBalance: 500,
        },
        update: {
          fullName: t.fullName, headline: t.headline, skills: t.skills, xp: t.xp, level: t.level,
        },
      });
    }

    // 4. Buat Studi Kasus (15 Challenges)
    const challengesData = [
      { company: 'hr@goto.com', title: 'High Concurrency Checkout', cat: ChallengeCategory.BACKEND, diff: ChallengeDifficulty.SENIOR, attachments: [{ type: 'image', url: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=800', caption: 'High-Level System Architecture' }, { type: 'document', url: 'https://docs.google.com', label: 'Load Test Spec' }] },
      { company: 'hr@traveloka.com', title: 'Flight Booking Redesign', cat: ChallengeCategory.UI_UX, diff: ChallengeDifficulty.MEDIOR, attachments: [{ type: 'image', url: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=800', caption: 'Current Flight Booking Flow' }] },
      { company: 'hr@efishery.com', title: 'IoT Feeder Dashboard', cat: ChallengeCategory.FRONTEND, diff: ChallengeDifficulty.JUNIOR, attachments: [{ type: 'image', url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=800', caption: 'IoT Dashboard Concept' }] },
      { company: 'hr@shopee.com', title: 'Flash Sale Anti-Bot System', cat: ChallengeCategory.BACKEND, diff: ChallengeDifficulty.SENIOR, attachments: [{ type: 'image', url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?q=80&w=800', caption: 'E-commerce Architecture' }] },
      { company: 'hr@grab.com', title: 'Driver Routing Optimization', cat: ChallengeCategory.DATA_SCIENCE, diff: ChallengeDifficulty.SENIOR, attachments: [{ type: 'image', url: 'https://images.unsplash.com/photo-1519003300449-424ad0405076?q=80&w=800', caption: 'City Map Routing' }] },
      { company: 'hr@bukalapak.com', title: 'SME Merchant App UX', cat: ChallengeCategory.UI_UX, diff: ChallengeDifficulty.MEDIOR, attachments: [{ type: 'image', url: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=800', caption: 'Merchant Storefront' }] },
      { company: 'hr@ruangguru.com', title: 'Interactive Video Player', cat: ChallengeCategory.FRONTEND, diff: ChallengeDifficulty.MEDIOR, attachments: [{ type: 'image', url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=800', caption: 'E-learning Interface' }] },
      { company: 'hr@bca.co.id', title: 'Secure Banking API', cat: ChallengeCategory.BACKEND, diff: ChallengeDifficulty.SENIOR, attachments: [{ type: 'image', url: 'https://images.unsplash.com/photo-1616077168079-7e09a6a7102e?q=80&w=800', caption: 'Banking Transactions' }] },
      { company: 'hr@telkomsel.com', title: '5G Campaign Landing Page', cat: ChallengeCategory.FRONTEND, diff: ChallengeDifficulty.JUNIOR, attachments: [{ type: 'image', url: 'https://images.unsplash.com/photo-1544890225-2f3fa1e4e843?q=80&w=800', caption: '5G Campaign Design' }] },
      { company: 'hr@tiket.com', title: 'Hotel Recommendation Engine', cat: ChallengeCategory.DATA_SCIENCE, diff: ChallengeDifficulty.MEDIOR, attachments: [{ type: 'image', url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=800', caption: 'Hotel Search Engine' }] },
      { company: 'hr@goto.com', title: 'Gopay Viral Marketing', cat: ChallengeCategory.MARKETING, diff: ChallengeDifficulty.JUNIOR, attachments: [{ type: 'image', url: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?q=80&w=800', caption: 'Digital Marketing Funnel' }] },
      { company: 'hr@traveloka.com', title: 'Xperience App Features', cat: ChallengeCategory.PRODUCT, diff: ChallengeDifficulty.SENIOR, attachments: [{ type: 'image', url: 'https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?q=80&w=800', caption: 'App Features Roadmap' }] },
      { company: 'hr@efishery.com', title: 'Aqua Farmer Mobile App', cat: ChallengeCategory.FRONTEND, diff: ChallengeDifficulty.MEDIOR, attachments: [{ type: 'image', url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=800', caption: 'Team Collaboration' }] },
      { company: 'hr@shopee.com', title: 'Affiliate Marketing Strategy', cat: ChallengeCategory.MARKETING, diff: ChallengeDifficulty.MEDIOR, attachments: [{ type: 'image', url: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=800', caption: 'Affiliate Dashboard' }] },
      { company: 'hr@grab.com', title: 'Food Delivery Time Prediction', cat: ChallengeCategory.DATA_SCIENCE, diff: ChallengeDifficulty.SENIOR, attachments: [{ type: 'image', url: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?q=80&w=800', caption: 'Predictive Analytics' }] },
    ];

    const challengeEntities: Record<string, any> = {};
    for (let i = 0; i < challengesData.length; i++) {
      const ch = challengesData[i];
      const comp = companyProfiles[ch.company];
      const slug = `${ch.company.split('@')[1].split('.')[0]}-${ch.title.toLowerCase().replace(/ /g, '-')}`;
      
      challengeEntities[slug] = await this.prisma.challenge.upsert({
        where: { slug },
        create: {
          companyId: comp.id, title: ch.title, slug, summary: `This is a ${ch.diff} ${ch.cat} challenge.`,
          description: `### Background\nSolve this ${ch.title} problem. \n### Requirements\n- Scale\n- Performance\n- Clean Code`,
          category: ch.cat, difficulty: ch.diff, gradingRubric: { code_cleanliness: 50, system_scalability: 50 },
          briefAttachments: ch.attachments,
          status: ChallengeStatus.PUBLISHED, rewardDescription: 'Interview + MacBook Pro',
          deadlineAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), challengeType: 'COMPANY',
        },
        update: { title: ch.title, category: ch.cat, difficulty: ch.diff, briefAttachments: ch.attachments },
      });
    }

    // 5. Enrollments & Submissions (Generate randomly across talents)
    const statuses = [SubmissionStatus.PASSED, SubmissionStatus.FAILED, SubmissionStatus.UNDER_REVIEW, SubmissionStatus.PENDING_AI];
    const hiringStatuses = [HiringStatus.NONE, HiringStatus.REJECTED, HiringStatus.SHORTLISTED, HiringStatus.INTERVIEW_INVITED, HiringStatus.HIRED];
    
    let submissionCount = 0;
    
    for (const t of talentUsersData) {
      const talent = talentProfiles[t.email];
      // Assign 3-5 challenges per talent
      const numChallenges = Math.floor(Math.random() * 3) + 3; 
      const shuffledChallenges = challengesData.sort(() => 0.5 - Math.random()).slice(0, numChallenges);
      
      for (const ch of shuffledChallenges) {
        const slug = `${ch.company.split('@')[1].split('.')[0]}-${ch.title.toLowerCase().replace(/ /g, '-')}`;
        const challenge = challengeEntities[slug];
        
        const subStatus = statuses[Math.floor(Math.random() * statuses.length)];
        let enrollStatus: EnrollmentStatus = EnrollmentStatus.SUBMITTED;
        if (subStatus === SubmissionStatus.PASSED || subStatus === SubmissionStatus.FAILED) {
           enrollStatus = EnrollmentStatus.EVALUATED;
        }

        const enroll = await this.prisma.challengeEnrollment.create({
          data: {
            talentId: talent.id, challengeId: challenge.id,
            status: enrollStatus,
            ndaSignedAt: new Date(), startedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
            completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          },
        });

        const finalScore = (subStatus === SubmissionStatus.PASSED) ? (Math.random() * 20 + 80) : (subStatus === SubmissionStatus.FAILED ? (Math.random() * 40 + 20) : null);
        const hStatus = (subStatus === SubmissionStatus.PASSED) ? hiringStatuses[Math.floor(Math.random() * 3) + 2] : HiringStatus.NONE;

        const submission = await this.prisma.submission.create({
          data: {
            enrollmentId: enroll.id, talentId: talent.id, challengeId: challenge.id,
            repositoryUrl: 'https://github.com/mock/repo', figmaUrl: 'https://figma.com/mock', liveDemoUrl: 'https://demo.com',
            aiScore: finalScore ? finalScore - 5 : null, finalScore: finalScore,
            status: subStatus, hiringStatus: hStatus, evaluatedAt: finalScore ? new Date() : null,
          },
        });
        
        submissionCount++;

        if (subStatus === SubmissionStatus.PASSED) {
          await this.prisma.portfolio.create({
            data: {
              talentId: talent.id, submissionId: submission.id, showcaseSummary: `Great work on ${ch.title}`,
              verifiedBadgeUrl: 'https://placehold.co/200x200/10b981/ffffff?text=Verified',
            }
          });
        }
      }
    }

    this.logger.log(`Seeding data sampel selesai! Dihasilkan ${submissionCount} submisi.`);
    return { success: true, message: 'Database telah diisi dengan data sampel lengkap setelah di-truncate.' };
  }
}
