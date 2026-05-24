import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SeedService } from '../src/seed/seed.service';

async function bootstrap() {
  console.log('🚀 Memulai eksekusi skrip seeder dari CLI...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const seedService = app.get(SeedService);
  await seedService.seed();
  await app.close();
  console.log('✅ Seeding CLI berhasil dijalankan.');
}

bootstrap().catch((err) => {
  console.error('❌ Terjadi kesalahan saat menjalankan seeder:', err);
  process.exit(1);
});
