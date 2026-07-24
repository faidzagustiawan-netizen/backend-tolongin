import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config();

import { ChallengesService } from './src/challenges/challenges.service';
import { PrismaService } from './src/prisma/prisma.service';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter }) as any;

async function main() {
  // Mock everything except prisma
  const service = new ChallengesService(
    prisma,
    {} as any, // aiService
    {} as any, // tokensService
    {} as any, // notificationsService
    { logAction: async () => {} } as any  // companiesService
  );

  const template = await prisma.challenge.findFirst({
    where: { isTemplate: true }
  });
  if (!template) {
    console.log('No template');
    return;
  }

  try {
    const result = await service.cloneTemplate(
      template.id, 
      'ef89ab4d-e89b-452f-9fd2-0c24dfb36e17', // profileId for company1
      '500ce843-8fbf-436a-81aa-034d8324d7ba'  // sub for company1
    );
    console.log('Cloned successfully:', result.id);
  } catch (err: any) {
    console.error('CLONE ERROR:', err.message, err.stack);
  }
}
main();
