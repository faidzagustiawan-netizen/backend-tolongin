import { SetMetadata } from '@nestjs/common';

export const COMPANY_ROLES_KEY = 'companyRoles';

/**
 * Peran di dalam ruang kerja perusahaan (OWNER / ADMIN / RECRUITER), berbeda
 * dari peran platform (@Roles) yang membedakan COMPANY, TALENT, dan ADMIN.
 *
 * Dipakai untuk tindakan yang tidak pantas dilakukan setiap anggota tim,
 * misalnya menerbitkan kode undangan ruang kerja.
 */
export const CompanyRoles = (...roles: string[]) =>
  SetMetadata(COMPANY_ROLES_KEY, roles);
