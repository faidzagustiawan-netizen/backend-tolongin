import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
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

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        talentProfile: true,
        companyProfile: true,
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
      },
    });

    if (!user) {
      throw new NotFoundException('Pengguna tidak ditemukan');
    }

    return user;
  }
}
