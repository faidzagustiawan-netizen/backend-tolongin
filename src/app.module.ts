import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ChallengesModule } from './challenges/challenges.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { HealthModule } from './health/health.module';
import { VerificationModule } from './verification/verification.module';
import { DiscussionsModule } from './discussions/discussions.module';
import { PortfoliosModule } from './portfolios/portfolios.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SeedModule } from './seed/seed.module';
import { StorageModule } from './storage/storage.module';
import { AiModule } from './ai/ai.module';
import { TokensModule } from './tokens/tokens.module';
import { PaymentsModule } from './payments/payments.module';
import { CompaniesModule } from './companies/companies.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { seedModuleEnabled } from './common/dev-flags';
import { APP_GUARD } from '@nestjs/core';
import { MailModule } from './mail/mail.module';
import { AdminModule } from './admin/admin.module';
import { SkillsModule } from './skills/skills.module';
import { QuestionBankModule } from './question-bank/question-bank.module';
import { StagesModule } from './stages/stages.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    UsersModule,
    CompaniesModule,
    AuthModule,
    ChallengesModule,
    SubmissionsModule,
    HealthModule,
    VerificationModule,
    DiscussionsModule,
    PortfoliosModule,
    SubscriptionsModule,
    NotificationsModule,
    // Endpoint seeding menghapus tabel dan tidak berguard. Lihat
    // `seedModuleEnabled` untuk alasan lengkap dan cara membukanya kembali.
    ...(seedModuleEnabled() ? [SeedModule] : []),
    StorageModule,
    AiModule,
    TokensModule,
    PaymentsModule,
    MailModule,
    AdminModule,
    SkillsModule,
    QuestionBankModule,
    StagesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      // Varian per-pengguna: kuota endpoint mahal seperti generator AI tidak
      // boleh dibagi rata satu alamat IP. Tamu tetap dihitung per IP.
      useClass: UserThrottlerGuard,
    },
  ],
})
export class AppModule {}
