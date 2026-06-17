import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { TokensService } from '../tokens/tokens.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { GenerateAiChallengeDto } from './dto/generate-ai-challenge.dto';
import {
  ChallengeCategory,
  ChallengeDifficulty,
  ChallengeStatus,
  ChallengeType,
  Prisma,
} from '@prisma/client';

@Injectable()
export class ChallengesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly tokensService: TokensService,
  ) {}

  async create(companyId: string, createChallengeDto: CreateChallengeDto) {
    const company = await this.prisma.companyProfile.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Perusahaan tidak ditemukan');

    const activeCount = await this.prisma.challenge.count({
      where: { companyId, status: { in: [ChallengeStatus.DRAFT, ChallengeStatus.PUBLISHED] } }
    });

    if (company.subscriptionTier === 'STARTUP' && activeCount >= 1) {
      throw new ForbiddenException('Paket Murah hanya mengizinkan 1 studi kasus aktif/draf. Silakan tingkatkan langganan Anda.');
    }
    if (company.subscriptionTier === 'KONGLOMERAT' && activeCount >= 5) {
      throw new ForbiddenException('Paket Pro hanya mengizinkan 5 studi kasus aktif/draf. Silakan tingkatkan langganan Anda.');
    }

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
        challengeType: ChallengeType.COMPANY,
        components: createChallengeDto.components && createChallengeDto.components.length > 0 ? {
          create: createChallengeDto.components.map(c => ({
            type: c.type,
            question: c.question,
            description: c.description,
            options: c.options || undefined,
            metadata: c.metadata || undefined,
            points: c.points ?? 10,
            order: c.order ?? 0,
          }))
        } : undefined,
      },
    });
  }

  async createPublic(userId: string, createChallengeDto: CreateChallengeDto) {
    const PUBLIC_CHALLENGE_COST = 50;
    
    // Deduct tokens
    await this.tokensService.spendTokens(
      userId, 
      PUBLIC_CHALLENGE_COST, 
      `Membuat Public Challenge: ${createChallengeDto.title}`
    );

    const talentProfile = await this.prisma.talentProfile.findUnique({
      where: { userId }
    });

    if (!talentProfile) {
      throw new NotFoundException('Profil Talenta tidak ditemukan');
    }

    const slug = this.generateSlug(createChallengeDto.title);

    const defaultRubric = {
      completeness: 30,
      quality: 40,
      efficiency: 30,
    };

    return this.prisma.challenge.create({
      data: {
        talentId: talentProfile.id,
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
        deadlineAt: createChallengeDto.deadlineAt ? new Date(createChallengeDto.deadlineAt) : null,
        isPrivate: createChallengeDto.isPrivate ?? false,
        status: createChallengeDto.status ?? ChallengeStatus.PUBLISHED,
        createdByAi: createChallengeDto.createdByAi ?? false,
        aiPromptUsed: createChallengeDto.aiPromptUsed,
        challengeType: ChallengeType.PUBLIC,
        components: createChallengeDto.components && createChallengeDto.components.length > 0 ? {
          create: createChallengeDto.components.map(c => ({
            type: c.type,
            question: c.question,
            description: c.description,
            options: c.options || undefined,
            metadata: c.metadata || undefined,
            points: c.points ?? 10,
            order: c.order ?? 0,
          }))
        } : undefined,
      },
    });
  }

  async findAll(query: {
    category?: ChallengeCategory;
    difficulty?: ChallengeDifficulty;
    search?: string;
    companyId?: string;
    includeDrafts?: string;
  }) {
    const where: Prisma.ChallengeWhereInput = {
      isPrivate: false,
    };

    if (query.includeDrafts === 'true' && query.companyId) {
      where.status = { in: [ChallengeStatus.PUBLISHED, ChallengeStatus.DRAFT] };
    } else {
      where.status = ChallengeStatus.PUBLISHED;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.difficulty) {
      where.difficulty = query.difficulty;
    }

    if (query.companyId) {
      where.companyId = query.companyId;
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
          select: { companyName: true, logoUrl: true, industry: true, trustScore: true },
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
        components: {
          orderBy: { order: 'asc' },
        },
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

    if (company.subscriptionTier === 'STARTUP') {
      throw new ForbiddenException('Fitur AI Generator dikunci pada Paket Murah. Silakan tingkatkan langganan Anda.');
    }

    const activeCount = await this.prisma.challenge.count({
      where: { companyId, status: { in: [ChallengeStatus.DRAFT, ChallengeStatus.PUBLISHED] } }
    });

    if (company.subscriptionTier === 'KONGLOMERAT' && activeCount >= 5) {
      throw new ForbiddenException('Paket Pro hanya mengizinkan 5 studi kasus aktif/draf. Silakan tingkatkan langganan Anda.');
    }

    const aiContent = await this.aiService.generateChallengeContent(
      dto.prompt,
      dto.category,
      dto.difficulty,
      company.companyName
    );

    const newChallenge = await this.prisma.challenge.create({
      data: {
        companyId,
        title: aiContent.title,
        slug: this.generateSlug(aiContent.title),
        summary: aiContent.summary,
        description: aiContent.description,
        category: dto.category,
        difficulty: dto.difficulty,
        gradingRubric: aiContent.rubric,
        status: ChallengeStatus.DRAFT,
        createdByAi: true,
        aiPromptUsed: dto.prompt,
        challengeType: ChallengeType.COMPANY,
      },
    });

    return newChallenge;
  }

  async generateAiPublicChallenge(userId: string, dto: GenerateAiChallengeDto) {
    const PUBLIC_CHALLENGE_COST = 50;

    // Deduct tokens
    await this.tokensService.spendTokens(
      userId, 
      PUBLIC_CHALLENGE_COST, 
      `AI Generate Public Challenge: ${dto.category}`
    );

    const talent = await this.prisma.talentProfile.findUnique({
      where: { userId },
    });

    if (!talent) {
      throw new NotFoundException('Profil Talenta tidak ditemukan');
    }

    const aiContent = await this.aiService.generateChallengeContent(
      dto.prompt,
      dto.category,
      dto.difficulty,
      'Komunitas / Public'
    );

    const newChallenge = await this.prisma.challenge.create({
      data: {
        talentId: talent.id,
        title: aiContent.title,
        slug: this.generateSlug(aiContent.title),
        summary: aiContent.summary,
        description: aiContent.description,
        category: dto.category,
        difficulty: dto.difficulty,
        gradingRubric: aiContent.rubric,
        status: ChallengeStatus.DRAFT,
        createdByAi: true,
        aiPromptUsed: dto.prompt,
        challengeType: ChallengeType.PUBLIC,
      },
    });

    return newChallenge;
  }

  async updateChallenge(id: string, companyId: string, updateDto: Partial<CreateChallengeDto>) {
    const challenge = await this.prisma.challenge.findFirst({
      where: { id, companyId }
    });

    if (!challenge) {
      throw new NotFoundException('Challenge tidak ditemukan');
    }

    if (challenge.status === ChallengeStatus.PUBLISHED && updateDto.status !== ChallengeStatus.PUBLISHED) {
      // You can't unpublish or edit a published challenge
      throw new ForbiddenException('Studi kasus yang sudah diterbitkan tidak dapat diubah lagi.');
    }
    
    if (challenge.status === ChallengeStatus.PUBLISHED) {
       throw new ForbiddenException('Studi kasus yang sudah diterbitkan tidak dapat diedit. Silakan buat yang baru.');
    }

    // Now update the challenge
    return this.prisma.challenge.update({
      where: { id },
      data: {
        title: updateDto.title,
        summary: updateDto.summary,
        description: updateDto.description,
        category: updateDto.category,
        difficulty: updateDto.difficulty,
        datasetUrl: updateDto.datasetUrl,
        mockApiUrl: updateDto.mockApiUrl,
        brandGuidelineUrl: updateDto.brandGuidelineUrl,
        rewardDescription: updateDto.rewardDescription,
        status: updateDto.status,
      }
    });
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
