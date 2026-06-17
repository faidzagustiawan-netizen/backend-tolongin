import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.companyProfile.findMany();
  for (const c of companies) {
    if (c.logoUrl && c.logoUrl.includes('logo.clearbit.com')) {
      const parts = c.logoUrl.split('/');
      let domain = parts[parts.length - 1]; // e.g. gotocompany.com
      let seed = domain.split('.')[0];
      // Capitalize first letter
      seed = seed.charAt(0).toUpperCase() + seed.slice(1);
      
      const newLogoUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${seed}`;
      await prisma.companyProfile.update({
        where: { id: c.id },
        data: { logoUrl: newLogoUrl }
      });
      console.log(`Updated ${domain} to ${newLogoUrl}`);
    }
  }
}

main()
  .then(() => console.log('Done'))
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
