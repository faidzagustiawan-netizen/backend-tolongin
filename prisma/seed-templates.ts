import { PrismaClient, ChallengeCategory, ChallengeDifficulty, ChallengeStatus, ComponentType } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding Templates...');

  // 1. Template Frontend Developer
  const challenge = await prisma.challenge.create({
    data: {
      title: 'Template: Junior Frontend Developer (React)',
      slug: 'template-junior-frontend-react',
      summary: 'Ujian komprehensif untuk Frontend Developer mencakup technical skill dan situational judgment.',
      description: 'Template ini dirancang untuk menyaring kandidat Junior Frontend Developer yang menguasai React.js. Terdiri dari dua tahap: Tahap 1 menguji pemahaman fundamental dan soft skill (komunikasi tim), dan Tahap 2 menguji kemampuan live coding optimasi komponen.',
      category: ChallengeCategory.FRONTEND,
      difficulty: ChallengeDifficulty.INTERMEDIATE,
      isTemplate: true,
      templateRole: 'Junior Frontend Developer',
      status: ChallengeStatus.PUBLISHED,
      gradingRubric: {
        codeQuality: 40,
        problemSolving: 30,
        softSkill: 30,
      }
    }
  });

  // Tahap 1
  const section1 = await prisma.challengeSection.create({
    data: {
      challengeId: challenge.id,
      title: 'Tahap 1: Screening & Soft Skills',
      description: 'Bagian ini menguji fundamental teknis dan soft skill kandidat.',
      order: 1,
    }
  });

  await prisma.challengeComponent.createMany({
    data: [
      {
        challengeId: challenge.id,
        sectionId: section1.id,
        type: ComponentType.MULTIPLE_CHOICE,
        question: 'Apa tujuan utama dari penggunaan useMemo di React?',
        metadata: { skillCategory: 'TECHNICAL' },
        options: [
          { id: '1', text: 'Mencegah re-render yang tidak perlu dari child component', isCorrect: false },
          { id: '2', text: 'Menyimpan referensi mutable yang tidak memicu render', isCorrect: false },
          { id: '3', text: 'Meng-cache hasil komputasi yang mahal (memoization)', isCorrect: true },
        ],
        points: 10,
        order: 1,
      },
      {
        challengeId: challenge.id,
        sectionId: section1.id,
        type: ComponentType.ESSAY,
        question: 'Situational Judgment: Anda menemukan bahwa PR (Pull Request) dari rekan setim Anda memiliki bug yang cukup fatal namun rekan Anda sudah offline. Deadline rilis adalah besok pagi. Apa yang akan Anda lakukan?',
        metadata: { skillCategory: 'SOFT_SKILL' },
        points: 30,
        order: 2,
      }
    ]
  });

  // Tahap 2
  const section2 = await prisma.challengeSection.create({
    data: {
      challengeId: challenge.id,
      title: 'Tahap 2: Live Case Study',
      description: 'Skenario dunia nyata: Optimasi performa aplikasi.',
      order: 2,
    }
  });

  await prisma.challengeComponent.create({
    data: {
      challengeId: challenge.id,
      sectionId: section2.id,
      type: ComponentType.LIVE_CODING,
      question: 'Terdapat sebuah komponen Data Table yang menampilkan ribuan baris data. Setiap kali pengguna mengetik di kolom pencarian, seluruh tabel mengalami render ulang sehingga aplikasi menjadi sangat lag. Silakan perbaiki komponen ini menggunakan React hooks yang tepat (seperti useMemo atau useCallback).',
      metadata: { skillCategory: 'TECHNICAL', language: 'javascript' },
      points: 60,
      order: 1,
    }
  });

  console.log('Seeding Templates completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
