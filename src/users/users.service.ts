import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const {
      email,
      password,
      role = Role.TALENT,
      fullName,
      companyName,
      industry,
    } = createUserDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          fullName: fullName || email.split('@')[0],
          passwordHash,
          role,
        },
      });

      const createSlug = (text: string) => {
        const base = (text || 'user').toString().toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
        return `${base}-${Math.random().toString(36).substring(2, 8)}`;
      };

      if (role === Role.TALENT) {
        const name = fullName || email.split('@')[0];
        await tx.talentProfile.create({
          data: {
            userId: user.id,
            fullName: name,
            slug: createSlug(name),
          },
        });
      } else if (role === Role.COMPANY) {
        const cName = companyName || 'Perusahaan Mitra';
        await tx.companyProfile.create({
          data: {
            userId: user.id,
            companyName: cName,
            industry: industry || 'Teknologi Informasi',
            // Paket selalu dimulai dari STARTUP, apa pun yang dikirim klien.
            //
            // Sebelumnya nilainya diambil dari `createUserDto.subscriptionTier`,
            // sehingga satu permintaan pendaftaran biasa cukup untuk memberi
            // diri sendiri paket berbayar tanpa pernah melewati Midtrans.
            // Peningkatan paket yang sah hanya lewat webhook pembayaran
            // (payments.service) atau penyesuaian manual admin
            // (subscriptions.service), yang keduanya meninggalkan jejak.
            subscriptionTier: 'STARTUP',
            // Kode undangan tidak dibuat otomatis saat pendaftaran. Pemilik
            // harus menerbitkannya sendiri lewat POST /companies/workspace/invite-code
            // agar kode tidak berumur panjang tanpa disadari.
            inviteCode: null,
            slug: createSlug(cName),
          },
        });
      }

      return tx.user.findUnique({
        where: { id: user.id },
        include: {
          talentProfile: true,
          companyProfile: true,
        },
      });
    });
  }

  async createTeamMember(createUserDto: CreateUserDto, inviteCode: string) {
    const { email, password, fullName } = createUserDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('Email sudah terdaftar');
    }

    if (!inviteCode || inviteCode.trim() === '') {
      throw new NotFoundException('Kode undangan wajib diisi');
    }

    const company = await this.prisma.companyProfile.findUnique({
      where: { inviteCode },
    });

    if (!company) {
      throw new NotFoundException(
        'Kode undangan tidak valid atau perusahaan tidak ditemukan',
      );
    }

    if (
      !company.inviteCodeExpiresAt ||
      company.inviteCodeExpiresAt.getTime() < Date.now()
    ) {
      throw new NotFoundException(
        'Kode undangan sudah kedaluwarsa. Minta kode baru kepada pemilik akun perusahaan.',
      );
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    return this.prisma.$transaction(async (tx) => {
      // Konsumsi kode lebih dulu di dalam transaksi. updateMany dengan syarat
      // kode masih terpasang membuat dua pendaftaran serentak tidak bisa
      // memakai kode yang sama — yang kalah mendapat count 0 dan dibatalkan.
      const consumed = await tx.companyProfile.updateMany({
        where: { id: company.id, inviteCode },
        data: { inviteCode: null, inviteCodeExpiresAt: null },
      });

      if (consumed.count === 0) {
        throw new NotFoundException('Kode undangan sudah dipakai');
      }

      const user = await tx.user.create({
        data: {
          email,
          fullName: fullName || email.split('@')[0],
          passwordHash,
          role: Role.COMPANY,
        },
      });

      await tx.companyMember.create({
        data: {
          userId: user.id,
          companyId: company.id,
          status: 'PENDING',
        },
      });

      await tx.companyActivityLog.create({
        data: {
          companyId: company.id,
          userId: user.id,
          action: 'MEMBER_JOINED',
          entityType: 'USER',
          entityId: user.id,
          details: { email: user.email },
        },
      });

      return tx.user.findUnique({
        where: { id: user.id },
        include: {
          talentProfile: true,
          companyProfile: true,
          teamMemberships: {
            include: {
              company: true,
            },
          },
        },
      });
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        talentProfile: {
          include: {
            submissions: {
              include: { challenge: true },
            },
          },
        },
        companyProfile: true,
        teamMemberships: {
          where: { status: 'APPROVED' },
          include: {
            company: true,
          },
        },
      },
    });
  }

  private static readonly PROFILE_INCLUDE = {
    talentProfile: {
      include: {
        earnedBadges: {
          include: { badge: true },
        },
        submissions: {
          include: { challenge: true },
        },
        experiences: true,
        educations: true,
      },
    },
    companyProfile: true,
    teamMemberships: {
      include: {
        company: true,
      },
    },
  } as const;

  /**
   * Mencari pengguna berdasarkan id akun ATAU slug profil.
   *
   * Bentuk UUID tidak bisa dipakai untuk membedakan keduanya: `slug` pada
   * TalentProfile dan CompanyProfile memakai `@default(uuid())`, sehingga
   * profil yang belum mengubah slug-nya punya slug yang persis berbentuk
   * UUID. Versi sebelumnya langsung menganggap semua UUID sebagai id akun
   * dan tidak pernah mencoba mencocokkannya sebagai slug, sehingga profil
   * seperti itu selalu berakhir "Pengguna tidak ditemukan".
   *
   * Karena itu pencocokan dilakukan berurutan, bukan berdasarkan bentuk:
   * coba sebagai id akun lebih dulu (jalur tersering), lalu sebagai slug.
   */
  async findById(idOrSlug: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrSlug,
      );

    let user = isUuid
      ? await this.prisma.user.findUnique({
          where: { id: idOrSlug },
          include: UsersService.PROFILE_INCLUDE,
        })
      : null;

    if (!user) {
      const talent = await this.prisma.talentProfile.findUnique({
        where: { slug: idOrSlug },
        select: { userId: true },
      });

      const resolvedUserId =
        talent?.userId ??
        (
          await this.prisma.companyProfile.findUnique({
            where: { slug: idOrSlug },
            select: { userId: true },
          })
        )?.userId;

      if (resolvedUserId) {
        user = await this.prisma.user.findUnique({
          where: { id: resolvedUserId },
          include: UsersService.PROFILE_INCLUDE,
        });
      }
    }

    if (!user) {
      throw new NotFoundException('Pengguna tidak ditemukan');
    }

    return user;
  }
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        talentProfile: true,
        companyProfile: true,
        teamMemberships: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Pengguna tidak ditemukan');
    }

    const companyId =
      user.companyProfile?.id || user.teamMemberships?.[0]?.companyId;

    if (user.role === Role.COMPANY && companyId) {
      await this.prisma.companyProfile.update({
        where: { id: companyId },
        data: {
          companyName:
            dto.companyName !== undefined ? dto.companyName : undefined,
          industry: dto.industry !== undefined ? dto.industry : undefined,
          companySize:
            dto.companySize !== undefined ? dto.companySize : undefined,
          websiteUrl: dto.websiteUrl !== undefined ? dto.websiteUrl : undefined,
          description:
            dto.description !== undefined ? dto.description : undefined,
          logoUrl: dto.logoUrl !== undefined ? dto.logoUrl : undefined,
          location: dto.location !== undefined ? dto.location : undefined,
          linkedinUrl:
            dto.linkedinUrl !== undefined ? dto.linkedinUrl : undefined,
        },
      });

      await this.prisma.companyActivityLog.create({
        data: {
          companyId: companyId,
          userId,
          action: 'PROFILE_UPDATED',
          entityType: 'COMPANY_PROFILE',
          entityId: companyId,
          details: { updatedFields: Object.keys(dto) },
        },
      });
    } else if (user.role === Role.TALENT && user.talentProfile) {
      const updateData: any = {
        fullName: dto.fullName !== undefined ? dto.fullName : undefined,
        headline: dto.headline !== undefined ? dto.headline : undefined,
        bio: dto.bio !== undefined ? dto.bio : undefined,
        skills: dto.skills !== undefined ? dto.skills : undefined,
        githubUrl: dto.githubUrl !== undefined ? dto.githubUrl : undefined,
        linkedinUrl:
          dto.linkedinUrl !== undefined ? dto.linkedinUrl : undefined,
        figmaUrl: dto.figmaUrl !== undefined ? dto.figmaUrl : undefined,
        resumeUrl: dto.resumeUrl !== undefined ? dto.resumeUrl : undefined,
        avatarUrl: dto.avatarUrl !== undefined ? dto.avatarUrl : undefined,
        location: dto.location !== undefined ? dto.location : undefined,
        roleCategory:
          dto.roleCategory !== undefined ? dto.roleCategory : undefined,
        // Acuan biometrik (encryptedPrivateFace, biometricFeatureVector)
        // tidak boleh diperbarui dari sini — lihat catatan di UpdateProfileDto.
        showcasedSubmissionIds:
          dto.showcasedSubmissionIds !== undefined
            ? dto.showcasedSubmissionIds
            : undefined,
      };

      await this.prisma.talentProfile.update({
        where: { userId },
        data: updateData,
      });

      if (dto.experiences) {
        // Simple replace all for experiences
        await this.prisma.experience.deleteMany({
          where: { talentId: user.talentProfile.id },
        });
        for (const exp of dto.experiences) {
          await this.prisma.experience.create({
            data: {
              talentId: user.talentProfile.id,
              title: exp.title,
              companyName: exp.companyName,
              employmentType: exp.employmentType,
              locationType: exp.locationType,
              location: exp.location,
              startDate: exp.startDate ? new Date(exp.startDate) : null,
              endDate: exp.endDate ? new Date(exp.endDate) : null,
              isCurrent: exp.isCurrent || false,
              description: exp.description,
            },
          });
        }
      }

      if (dto.educations) {
        // Simple replace all for educations
        await this.prisma.education.deleteMany({
          where: { talentId: user.talentProfile.id },
        });
        for (const edu of dto.educations) {
          await this.prisma.education.create({
            data: {
              talentId: user.talentProfile.id,
              school: edu.school,
              degree: edu.degree,
              fieldOfStudy: edu.fieldOfStudy,
              startDate: edu.startDate ? new Date(edu.startDate) : null,
              endDate: edu.endDate ? new Date(edu.endDate) : null,
              grade: edu.grade,
              activities: edu.activities,
              description: edu.description,
            },
          });
        }
      }
    }

    return this.findById(userId);
  }
}
