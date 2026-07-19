const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function slugify(text) {
  if (!text) return 'user-' + Math.random().toString(36).substring(2, 8);
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')       // Replace spaces with -
    .replace(/[^\w\-]+/g, '')   // Remove all non-word chars
    .replace(/\-\-+/g, '-');    // Replace multiple - with single -
}

async function migrateSlugs() {
  console.log('Migrating Company slugs...');
  const companies = await prisma.companyProfile.findMany();
  for (const company of companies) {
    let baseSlug = slugify(company.companyName);
    let finalSlug = baseSlug;
    let counter = 1;
    while (true) {
      const existing = await prisma.companyProfile.findUnique({ where: { slug: finalSlug } });
      if (!existing || existing.id === company.id) break;
      finalSlug = `${baseSlug}-${counter}`;
      counter++;
    }
    await prisma.companyProfile.update({
      where: { id: company.id },
      data: { slug: finalSlug },
    });
    console.log(`Updated company ${company.companyName} -> ${finalSlug}`);
  }

  console.log('Migrating Talent slugs...');
  const talents = await prisma.talentProfile.findMany();
  for (const talent of talents) {
    let baseSlug = slugify(talent.fullName);
    let finalSlug = baseSlug;
    let counter = 1;
    while (true) {
      const existing = await prisma.talentProfile.findUnique({ where: { slug: finalSlug } });
      if (!existing || existing.id === talent.id) break;
      finalSlug = `${baseSlug}-${counter}`;
      counter++;
    }
    await prisma.talentProfile.update({
      where: { id: talent.id },
      data: { slug: finalSlug },
    });
    console.log(`Updated talent ${talent.fullName} -> ${finalSlug}`);
  }
  console.log('Done migrating slugs.');
}

migrateSlugs()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
