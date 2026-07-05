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
          passwordHash,
          role,
        },
      });

      if (role === Role.TALENT) {
        await tx.talentProfile.create({
          data: {
            userId: user.id,
            fullName: fullName || email.split('@')[0],
          },
        });
      } else if (role === Role.COMPANY) {
        await tx.companyProfile.create({
          data: {
            userId: user.id,
            companyName: companyName || 'Perusahaan Mitra',
            industry: industry || 'Teknologi Informasi',
            subscriptionTier: subscriptionTier || 'STARTUP',
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

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const company = await this.prisma.companyProfile.findUnique({
      where: { inviteCode }
    });

    if (!company) {
      throw new NotFoundException('Kode undangan tidak valid atau perusahaan tidak ditemukan');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: Role.COMPANY,
        },
      });

      await tx.companyMember.create({
        data: {
          userId: user.id,
          companyId: company.id,
          role: 'ADMIN',
        }
      });

      return tx.user.findUnique({
        where: { id: user.id },
        include: {
          talentProfile: true,
          companyProfile: true,
          teamMemberships: {
            include: {
              company: true,
            }
          },
        },
      });
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        talentProfile: true,
        companyProfile: true,
        teamMemberships: {
          include: {
            company: true,
          }
        },
      },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        talentProfile: {
          include: {
            earnedBadges: {
              include: { badge: true },
            },
          },
        },
        companyProfile: true,
        teamMemberships: {
          include: {
            company: true,
          }
        }
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
      include: { talentProfile: true, companyProfile: true },
    });

    if (!user) {
      throw new NotFoundException('Pengguna tidak ditemukan');
    }

    if (user.role === Role.COMPANY && user.companyProfile) {
      await this.prisma.companyProfile.update({
        where: { userId },
        data: {
          companyName: dto.companyName !== undefined ? dto.companyName : undefined,
          industry: dto.industry !== undefined ? dto.industry : undefined,
          companySize: dto.companySize !== undefined ? dto.companySize : undefined,
          websiteUrl: dto.websiteUrl !== undefined ? dto.websiteUrl : undefined,
          description: dto.description !== undefined ? dto.description : undefined,
          logoUrl: dto.logoUrl !== undefined ? dto.logoUrl : undefined,
          location: dto.location !== undefined ? dto.location : undefined,
          linkedinUrl: dto.linkedinUrl !== undefined ? dto.linkedinUrl : undefined,
        },
      });
    } else if (user.role === Role.TALENT && user.talentProfile) {
      const updateData: any = {
        fullName: dto.fullName !== undefined ? dto.fullName : undefined,
        headline: dto.headline !== undefined ? dto.headline : undefined,
        bio: dto.bio !== undefined ? dto.bio : undefined,
        skills: dto.skills !== undefined ? dto.skills : undefined,
        githubUrl: dto.githubUrl !== undefined ? dto.githubUrl : undefined,
        linkedinUrl: dto.linkedinUrl !== undefined ? dto.linkedinUrl : undefined,
        figmaUrl: dto.figmaUrl !== undefined ? dto.figmaUrl : undefined,
        resumeUrl: dto.resumeUrl !== undefined ? dto.resumeUrl : undefined,
        avatarUrl: dto.avatarUrl !== undefined ? dto.avatarUrl : undefined,
        location: dto.location !== undefined ? dto.location : undefined,
        roleCategory: dto.roleCategory !== undefined ? dto.roleCategory : undefined,
      };

      await this.prisma.talentProfile.update({
        where: { userId },
        data: updateData,
      });
    }

    return this.findById(userId);
  }
}
