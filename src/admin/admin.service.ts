import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverviewStats() {
    const totalUsers = await this.prisma.user.count();
    const totalTalents = await this.prisma.user.count({ where: { role: 'TALENT' } });
    const totalCompanies = await this.prisma.user.count({ where: { role: 'COMPANY' } });
    const totalChallenges = await this.prisma.challenge.count();
    const totalSubmissions = await this.prisma.submission.count();
    
    return {
      totalUsers,
      totalTalents,
      totalCompanies,
      totalChallenges,
      totalSubmissions,
    };
  }

  async getPendingCompanies() {
    return this.prisma.companyProfile.findMany({
      where: {
        kybStatus: 'PENDING',
      },
      include: {
        user: true,
      }
    });
  }

  async verifyCompany(companyId: string, status: 'VERIFIED' | 'FAILED') {
    const company = await this.prisma.companyProfile.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return this.prisma.companyProfile.update({
      where: { id: companyId },
      data: { kybStatus: status },
    });
  }
}
