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
      subscriptionTier,
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
        const randomStr = Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();
        const cName = companyName || 'Perusahaan Mitra';
        await tx.companyProfile.create({
          data: {
            userId: user.id,
            companyName: cName,
            industry: industry || 'Teknologi Informasi',
            subscriptionTier: subscriptionTier || 'STARTUP',
            inviteCode: `CMP-${randomStr}`,
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

    const company = await this.prisma.companyProfile.findUnique({
      where: { inviteCode },
    });

    if (!company) {
      throw new NotFoundException(
        'Kode undangan tidak valid atau perusahaan tidak ditemukan',
      );
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          fullName: fullName || email.split('@')[0],
          passwordHash,
          role: Role.COMPANY,
          isVerified: true,
        },
      });

      await tx.companyMember.create({
        data: {
          userId: user.id,
          companyId: company.id,
          role: 'ADMIN',
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
          include: {
            company: true,
          },
        },
      },
    });
  }

  async findById(idOrSlug: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    let userId = idOrSlug;

    if (!isUuid) {
      // Find the user ID based on slug
      const talent = await this.prisma.talentProfile.findUnique({ where: { slug: idOrSlug } });
      if (talent) {
        userId = talent.userId;
      } else {
        const company = await this.prisma.companyProfile.findUnique({ where: { slug: idOrSlug } });
        if (company) userId = company.userId;
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
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
      },
    });

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
        encryptedPrivateFace:
          dto.encryptedPrivateFace !== undefined
            ? dto.encryptedPrivateFace
            : undefined,
        biometricFeatureVector:
          dto.biometricFeatureVector !== undefined
            ? JSON.stringify(dto.biometricFeatureVector)
            : undefined,
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
              description: edu.description,
            },
          });
        }
      }
    }

    return this.findById(userId);
  }
}
