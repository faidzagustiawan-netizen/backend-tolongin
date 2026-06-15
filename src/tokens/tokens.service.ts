import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TokenType } from '@prisma/client';

@Injectable()
export class TokensService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(userId: string) {
    const talent = await this.prisma.talentProfile.findUnique({
      where: { userId },
    });
    if (!talent) {
      throw new NotFoundException('Profil Talenta tidak ditemukan.');
    }
    return { tokenBalance: talent.tokenBalance };
  }

  async getTransactionHistory(userId: string) {
    return this.prisma.tokenTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async topUp(userId: string, amount: number) {
    // Simulasi Top-Up
    if (amount <= 0) {
      throw new BadRequestException('Jumlah top-up harus lebih dari 0.');
    }

    return this.prisma.$transaction(async (tx) => {
      const talent = await tx.talentProfile.findUnique({ where: { userId } });
      if (!talent) throw new NotFoundException('Talent tidak ditemukan');

      await tx.talentProfile.update({
        where: { userId },
        data: { tokenBalance: { increment: amount } },
      });

      await tx.tokenTransaction.create({
        data: {
          userId,
          amount,
          type: TokenType.EARN,
          description: `Top-Up Simulation +${amount} Tokens`,
        },
      });

      return { success: true, amount, message: 'Top-Up Berhasil (Simulasi)' };
    });
  }

  async spendTokens(userId: string, amount: number, description: string) {
    return this.prisma.$transaction(async (tx) => {
      const talent = await tx.talentProfile.findUnique({ where: { userId } });
      if (!talent) throw new NotFoundException('Talent tidak ditemukan');

      if (talent.tokenBalance < amount) {
        throw new BadRequestException('Token tidak mencukupi.');
      }

      await tx.talentProfile.update({
        where: { userId },
        data: { tokenBalance: { decrement: amount } },
      });

      await tx.tokenTransaction.create({
        data: {
          userId,
          amount,
          type: TokenType.SPEND,
          description,
        },
      });

      return { success: true };
    });
  }

  async earnTokens(userId: string, amount: number, description: string) {
    return this.prisma.$transaction(async (tx) => {
      const talent = await tx.talentProfile.findUnique({ where: { userId } });
      if (!talent) throw new NotFoundException('Talent tidak ditemukan');

      await tx.talentProfile.update({
        where: { userId },
        data: { tokenBalance: { increment: amount } },
      });

      await tx.tokenTransaction.create({
        data: {
          userId,
          amount,
          type: TokenType.EARN,
          description,
        },
      });

      return { success: true };
    });
  }
}
