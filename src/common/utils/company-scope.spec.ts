import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { resolveCompanyScope } from './company-scope';

describe('resolveCompanyScope', () => {
  it('memakai profil dari token untuk peran perusahaan', () => {
    expect(resolveCompanyScope({ role: Role.COMPANY, profileId: 'co-1' })).toBe(
      'co-1',
    );
  });

  it('mengabaikan companyId yang dikirim perusahaan', () => {
    // Kalau nilai dari klien dipakai, satu perusahaan bisa membaca ruang kerja
    // perusahaan lain hanya dengan menebak id-nya.
    expect(
      resolveCompanyScope({ role: Role.COMPANY, profileId: 'co-1' }, 'co-lain'),
    ).toBe('co-1');
  });

  it('menolak perusahaan tanpa profil alih-alih meneruskan undefined', () => {
    expect(() => resolveCompanyScope({ role: Role.COMPANY })).toThrow(
      BadRequestException,
    );
  });

  it('menolak admin yang tidak menyebut perusahaan tujuan', () => {
    // Inti perbaikannya: `where: { companyId: undefined }` membuat Prisma
    // membuang syaratnya dan mengembalikan data seluruh perusahaan.
    expect(() => resolveCompanyScope({ role: Role.ADMIN })).toThrow(
      /wajib menyertakan companyId/,
    );
  });

  it('memakai companyId eksplisit milik admin', () => {
    expect(resolveCompanyScope({ role: Role.ADMIN }, 'co-9')).toBe('co-9');
  });

  it('menolak pemanggil tanpa sesi', () => {
    expect(() => resolveCompanyScope(undefined)).toThrow(BadRequestException);
  });
});
