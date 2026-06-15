const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const comp = await prisma.user.findFirst({ where: { email: 'hr@traveloka.com' }, include: { companyProfile: true } });
  if (!comp) return console.log('not found');
  console.log('Company ID:', comp.companyProfile.id);

  const challenges = await prisma.challenge.findMany({
    where: { companyId: comp.companyProfile.id },
    include: { submissions: true }
  });
  console.log('Challenges for Traveloka:', challenges.length);

  const comp2 = await prisma.user.findFirst({ where: { email: 'hr@goto.com' }, include: { companyProfile: true } });
  const challenges2 = await prisma.challenge.findMany({
    where: { companyId: comp2.companyProfile.id },
    include: { submissions: true }
  });
  console.log('Challenges for GoTo:', challenges2.length);
}
main().finally(() => prisma.$disconnect());
