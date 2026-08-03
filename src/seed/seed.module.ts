import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';
import { BadgesModule } from '../badges/badges.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  // JwtModule dibutuhkan JwtAuthGuard pada SeedController. Tanpa `register`,
  // sama seperti AdminModule: guard itu menyerahkan secret secara eksplisit ke
  // `verifyAsync`, jadi konfigurasi modulnya tidak dipakai.
  imports: [PrismaModule, JwtModule, BadgesModule],
  controllers: [SeedController],
  providers: [SeedService],
})
export class SeedModule {}
