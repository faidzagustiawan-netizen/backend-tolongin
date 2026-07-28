import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ChallengesModule } from '../../challenges/challenges.module';
import { DiscussionsModule } from '../../discussions/discussions.module';
import { SubmissionsModule } from '../../submissions/submissions.module';
import { CompaniesModule } from '../../companies/companies.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { MailModule } from '../../mail/mail.module';
import { AuthModule } from '../auth.module';
import { VerifiedCompanyGuard } from './verified-company.guard';
import { CompanyRolesGuard } from './company-roles.guard';

// VerifiedCompanyGuard dan CompanyRolesGuard baru saja berubah dari kelas
// tanpa dependensi menjadi kelas yang menyuntik PrismaService. Kegagalan
// resolusinya hanya muncul saat boot, bukan saat kompilasi — dan artinya
// seluruh API mati. SeedModule sengaja tidak ikut: @faker-js/faker v10 murni
// ESM dan tidak bisa dimuat transformer CJS milik Jest.
describe('DI guard yang menyuntik Prisma', () => {
  it('teresolusi di modul-modul yang memakainya', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
        PrismaModule,
        NotificationsModule,
        MailModule,
        AuthModule,
        CompaniesModule,
        ChallengesModule,
        DiscussionsModule,
        SubmissionsModule,
      ],
      providers: [VerifiedCompanyGuard, CompanyRolesGuard],
    }).compile();

    expect(moduleRef.get(VerifiedCompanyGuard)).toBeInstanceOf(
      VerifiedCompanyGuard,
    );
    expect(moduleRef.get(CompanyRolesGuard)).toBeInstanceOf(CompanyRolesGuard);

    await moduleRef.close();
  }, 60000);
});
