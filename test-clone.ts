import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
import crypto from 'crypto';

async function main() {
  const template = await prisma.challenge.findFirst({
    where: { isTemplate: true },
    include: { sections: { include: { components: true } } }
  });
  if (!template) throw new Error('No template');

  const company = await prisma.companyProfile.findFirst();
  if (!company) throw new Error('No company');

  console.log(`Cloning ${template.id} to ${company.id}`);

  const challengeId = crypto.randomUUID();
  try {
    const newChallenge = await prisma.challenge.create({
      data: {
        id: challengeId,
        companyId: company.id,
        title: template.title,
        slug: template.slug + '-' + Date.now(),
        summary: template.summary,
        description: template.description,
        category: template.category,
        difficulty: template.difficulty,
        datasetUrl: template.datasetUrl,
        mockApiUrl: template.mockApiUrl,
        brandGuidelineUrl: template.brandGuidelineUrl,
        gradingRubric: template.gradingRubric ?? {},
        rewardDescription: template.rewardDescription,
        status: 'DRAFT',
        isPrivate: false,
        isTemplate: false,
        challengeType: 'COMPANY',
        sections: {
          create: template.sections.map((s) => ({
            title: s.title,
            description: s.description,
            order: s.order,
            components: {
              create: s.components.map((c) => ({
                challengeId: challengeId,
                type: c.type,
                question: c.question,
                description: c.description,
                options: c.options || undefined,
                metadata: c.metadata || undefined,
                points: c.points,
                order: c.order,
              })),
            },
          })),
        },
      }
    });
    console.log('Success!', newChallenge.id);
  } catch (e) {
    console.error('Error during create:', e);
  }
}
main().finally(() => prisma.$disconnect());
