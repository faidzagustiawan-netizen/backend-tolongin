import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { GenerateAiChallengeDto } from './dto/generate-ai-challenge.dto';
import {
  ChallengeCategory,
  ChallengeDifficulty,
  ChallengeStatus,
  Prisma,
} from '@prisma/client';

@Injectable()
export class ChallengesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, createChallengeDto: CreateChallengeDto) {
    const slug = this.generateSlug(createChallengeDto.title);

    const defaultRubric = {
      completeness: 30,
      quality: 40,
      efficiency: 30,
    };

    return this.prisma.challenge.create({
      data: {
        companyId,
        title: createChallengeDto.title,
        slug,
        summary: createChallengeDto.summary,
        description: createChallengeDto.description,
        category: createChallengeDto.category,
        difficulty: createChallengeDto.difficulty,
        datasetUrl: createChallengeDto.datasetUrl,
        mockApiUrl: createChallengeDto.mockApiUrl,
        brandGuidelineUrl: createChallengeDto.brandGuidelineUrl,
        gradingRubric: createChallengeDto.gradingRubric ?? defaultRubric,
        rewardDescription: createChallengeDto.rewardDescription,
        deadlineAt: createChallengeDto.deadlineAt
          ? new Date(createChallengeDto.deadlineAt)
          : null,
        isPrivate: createChallengeDto.isPrivate ?? false,
        status: createChallengeDto.status ?? ChallengeStatus.PUBLISHED,
        createdByAi: createChallengeDto.createdByAi ?? false,
        aiPromptUsed: createChallengeDto.aiPromptUsed,
      },
    });
  }

  async findAll(query: {
    category?: ChallengeCategory;
    difficulty?: ChallengeDifficulty;
    search?: string;
    companyId?: string;
  }) {
    const where: Prisma.ChallengeWhereInput = {
      status: ChallengeStatus.PUBLISHED,
      isPrivate: false,
    };

    if (query.category) {
      where.category = query.category;
    }

    if (query.difficulty) {
      where.difficulty = query.difficulty;
    }

    if (query.companyId) {
      where.companyId = query.companyId;
      delete where.status;
      delete where.isPrivate;
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { summary: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.challenge.findMany({
      where,
      include: {
        company: {
          select: { companyName: true, logoUrl: true, industry: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(slugOrId: string) {
    const challenge = await this.prisma.challenge.findFirst({
      where: {
        OR: [{ id: slugOrId }, { slug: slugOrId }],
      },
      include: {
        company: true,
        discussions: {
          include: { user: { select: { email: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!challenge) {
      throw new NotFoundException('Challenge tidak ditemukan');
    }

    return challenge;
  }

  async generateAiChallenge(companyId: string, dto: GenerateAiChallengeDto) {
    const company = await this.prisma.companyProfile.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Profil Perusahaan tidak ditemukan');
    }

    const generatedTitle = `AI Case: ${dto.category} Challenge for ${company.companyName}`;
    const generatedSummary = `Tantangan penyelesaian studi kasus otomatis berbasis AI untuk menguji keahlian ${dto.difficulty} di bidang ${dto.category}. Berdasarkan kebutuhan: "${dto.prompt}".`;
    const generatedDescription = `### Latar Belakang Bisnis\n${company.companyName} sedang menghadapi tantangan strategis terkait: ${dto.prompt}.\n\n### Objektif & Target\nKandidat diharapkan mampu merancang dan mendemonstrasikan solusi nyata yang efisien, skalabel, dan siap diimplementasikan dalam ekosistem industri.\n\n### Batasan & Persyaratan\n- Harus mengikuti arsitektur modern.\n- Performa tinggi dengan latensi minimal.\n- Kode/Sistem terdokumentasi dengan baik.`;

    const rubric = {
      code_architecture: 40,
      problem_solving: 35,
      system_scalability: 25,
    };

    const newChallenge = await this.prisma.challenge.create({
      data: {
        companyId,
        title: generatedTitle,
        slug: this.generateSlug(generatedTitle),
        summary: generatedSummary,
        description: generatedDescription,
        category: dto.category,
        difficulty: dto.difficulty,
        datasetUrl: 'https://storage.tolongin.co/dummy/dataset-sample.json',
        gradingRubric: rubric,
        status: ChallengeStatus.DRAFT,
        createdByAi: true,
        aiPromptUsed: dto.prompt,
      },
    });

    return newChallenge;
  }

  private generateSlug(title: string): string {
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `${baseSlug}-${randomSuffix}`;
  }
}
