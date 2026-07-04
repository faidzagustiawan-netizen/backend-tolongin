import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const challenge = await prisma.challenge.findFirst({
    where: { title: { contains: 'Boss Fight' } },
    include: { sections: { include: { components: true } }, components: true }
  });
  console.log(JSON.stringify(challenge, null, 2));
}
main().finally(() => prisma.$disconnect());
