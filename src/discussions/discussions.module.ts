import { Module } from '@nestjs/common';
import { DiscussionsController } from './discussions.controller';
import { DiscussionsService } from './discussions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { BadgesModule } from '../badges/badges.module';

@Module({
  imports: [PrismaModule, JwtModule, BadgesModule],
  controllers: [DiscussionsController],
  providers: [DiscussionsService],
})
export class DiscussionsModule {}
