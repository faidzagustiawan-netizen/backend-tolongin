import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const c = await prisma.user.findFirst({ 
    where: { email: 'company1@test.com' },
    include: { companyProfile: true } 
  });
  console.log('Company1 User:', c);
}
main().finally(() => prisma.$disconnect());
