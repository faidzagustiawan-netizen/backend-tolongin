import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { TokensService } from '../tokens/tokens.service';
import { NotificationsService } from '../notifications/notifications.service';
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
    private readonly notificationsService: NotificationsService,
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

    const challengeId = crypto.randomUUID();

    const newChallenge = await this.prisma.challenge.create({
      data: {
        id: challengeId,
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
        rewardDescription: this.generateSystemRewardDescription(createChallengeDto.difficulty),
        startsAt: createChallengeDto.startsAt
          ? new Date(createChallengeDto.startsAt)
          : null,
        deadlineAt: createChallengeDto.deadlineAt
          ? new Date(createChallengeDto.deadlineAt)
          : null,
        isPrivate: createChallengeDto.isPrivate ?? false,
        status: createChallengeDto.status ?? ChallengeStatus.PUBLISHED,
        createdByAi: createChallengeDto.createdByAi ?? false,
        aiPromptUsed: createChallengeDto.aiPromptUsed,
        challengeType: ChallengeType.COMPANY,
        sections: createChallengeDto.sections && createChallengeDto.sections.length > 0 ? {
          create: createChallengeDto.sections.map(s => ({
            title: s.title,
            description: s.description,
            order: s.order ?? 0,
            components: s.components && s.components.length > 0 ? {
              create: s.components.map(c => ({
                challengeId: challengeId,
                type: c.type as any,
                question: c.question,
                description: c.description,
                options: c.options || undefined,
                metadata: c.metadata || undefined,
                points: c.points ?? 10,
                order: c.order ?? 0,
              }))
            } : undefined
          }))
        } : undefined,
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: company.userId,
        title: 'Studi Kasus Diterbitkan',
        content: `Studi Kasus "${newChallenge.title}" berhasil ${createChallengeDto.status === ChallengeStatus.DRAFT ? 'disimpan sebagai draft' : 'diterbitkan'}.`,
        linkUrl: `/challenges/${newChallenge.slug}`,
      }
    });

    return newChallenge;
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

    const challengeId = crypto.randomUUID();

    const newChallenge = await this.prisma.challenge.create({
      data: {
        id: challengeId,
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
        rewardDescription: this.generateSystemRewardDescription(createChallengeDto.difficulty),
        deadlineAt: createChallengeDto.deadlineAt ? new Date(createChallengeDto.deadlineAt) : null,
        isPrivate: createChallengeDto.isPrivate ?? false,
        status: createChallengeDto.status ?? ChallengeStatus.PUBLISHED,
        createdByAi: createChallengeDto.createdByAi ?? false,
        aiPromptUsed: createChallengeDto.aiPromptUsed,
        challengeType: ChallengeType.PUBLIC,
        sections: createChallengeDto.sections && createChallengeDto.sections.length > 0 ? {
          create: createChallengeDto.sections.map(s => ({
            title: s.title,
            description: s.description,
            order: s.order ?? 0,
            components: s.components && s.components.length > 0 ? {
              create: s.components.map(c => ({
                challengeId: challengeId,
                type: c.type as any,
                question: c.question,
                description: c.description,
                options: c.options || undefined,
                metadata: c.metadata || undefined,
                points: c.points ?? 10,
                order: c.order ?? 0,
              }))
            } : undefined
          }))
        } : undefined,
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: talentProfile.userId,
        title: 'Public Challenge Diterbitkan',
        content: `Public Challenge "${newChallenge.title}" berhasil ${createChallengeDto.status === ChallengeStatus.DRAFT ? 'disimpan sebagai draft' : 'diterbitkan'}.`,
        linkUrl: `/challenges/${newChallenge.slug}`,
      }
    });

    return newChallenge;
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
        creator: {
          select: { fullName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(slugOrId: string, userReq?: any) {
    const challenge = await this.prisma.challenge.findFirst({
      where: {
        OR: [{ id: slugOrId }, { slug: slugOrId }],
      },
      include: {
        company: true,
        components: {
          orderBy: { order: 'asc' },
        },
        sections: {
          include: {
            components: {
              orderBy: { order: 'asc' },
            },
          },
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

    let isOwner = false;
    if (userReq && userReq.role === 'COMPANY' && userReq.profileId === challenge.companyId) {
      isOwner = true;
    }

    if (!isOwner) {
      const redactComponent = (comp: any) => ({
        ...comp,
        question: '[TERKUNCI - HARAP DAFTAR]',
        options: null,
        metadata: null,
        points: comp.points
      });

      if (challenge.components) {
        challenge.components = challenge.components.map(redactComponent) as any;
      }
      if (challenge.sections) {
        challenge.sections = challenge.sections.map(sec => ({
          ...sec,
          components: sec.components.map(redactComponent)
        })) as any;
      }
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
        rewardDescription: this.generateSystemRewardDescription(dto.difficulty),
        startsAt: aiContent.startsAt ? new Date(aiContent.startsAt) : null,
        deadlineAt: aiContent.deadlineAt ? new Date(aiContent.deadlineAt) : null,
        status: ChallengeStatus.DRAFT,
        createdByAi: true,
        aiPromptUsed: dto.prompt,
        challengeType: ChallengeType.COMPANY,
        sections: aiContent.sections && aiContent.sections.length > 0 ? {
          create: aiContent.sections.map((s: any, sIdx: number) => ({
            title: s.title,
            description: s.description,
            order: sIdx,
            components: s.components && s.components.length > 0 ? {
              create: s.components.map((c: any, cIdx: number) => ({
                type: c.type || 'TEXT',
                question: c.question,
                points: c.points ?? 10,
                order: cIdx,
              }))
            } : undefined
          }))
        } : undefined,
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: company.userId,
        title: 'Draft AI Selesai',
        content: `Sistem AI telah selesai membuat draf studi kasus "${newChallenge.title}". Silakan periksa dan terbitkan.`,
        linkUrl: `/workspace/edit/${newChallenge.id}`,
      }
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
        rewardDescription: this.generateSystemRewardDescription(dto.difficulty),
        startsAt: aiContent.startsAt ? new Date(aiContent.startsAt) : null,
        deadlineAt: aiContent.deadlineAt ? new Date(aiContent.deadlineAt) : null,
        status: ChallengeStatus.DRAFT,
        createdByAi: true,
        aiPromptUsed: dto.prompt,
        challengeType: ChallengeType.PUBLIC,
        sections: aiContent.sections && aiContent.sections.length > 0 ? {
          create: aiContent.sections.map((s: any, sIdx: number) => ({
            title: s.title,
            description: s.description,
            order: sIdx,
            components: s.components && s.components.length > 0 ? {
              create: s.components.map((c: any, cIdx: number) => ({
                type: c.type || 'TEXT',
                question: c.question,
                points: c.points ?? 10,
                order: cIdx,
              }))
            } : undefined
          }))
        } : undefined,
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: talent.userId,
        title: 'Draft AI Selesai',
        content: `Sistem AI telah selesai membuat draf Public Challenge "${newChallenge.title}". Silakan periksa dan terbitkan.`,
        linkUrl: `/workspace/edit/${newChallenge.id}`,
      }
    });

    return newChallenge;
  }

  async updateChallenge(id: string, profileId: string, updateDto: Partial<CreateChallengeDto>) {
    const challenge = await this.prisma.challenge.findFirst({
      where: { 
        id, 
        OR: [
          { companyId: profileId },
          { talentId: profileId }
        ]
      }
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
        gradingRubric: updateDto.gradingRubric !== undefined ? updateDto.gradingRubric : undefined,
        rewardDescription: updateDto.difficulty ? this.generateSystemRewardDescription(updateDto.difficulty) : undefined,
        startsAt: updateDto.startsAt ? new Date(updateDto.startsAt) : undefined,
        status: updateDto.status,
        sections: updateDto.sections && updateDto.sections.length > 0 ? {
          deleteMany: {},
          create: updateDto.sections.map(s => ({
            title: s.title,
            description: s.description,
            order: s.order ?? 0,
            components: s.components && s.components.length > 0 ? {
              create: s.components.map(c => ({
                challengeId: id,
                type: c.type as any,
                question: c.question,
                description: c.description,
                options: c.options || undefined,
                metadata: c.metadata || undefined,
                points: c.points ?? 10,
                order: c.order ?? 0,
              }))
            } : undefined
          }))
        } : undefined,
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

  private generateSystemRewardDescription(difficulty: ChallengeDifficulty): string {
    let maxToken = 10;
    let maxXP = 100;

    if (difficulty === ChallengeDifficulty.INTERMEDIATE) {
      maxToken = 30;
      maxXP = 200;
    } else if (difficulty === ChallengeDifficulty.ADVANCED) {
      maxToken = 75;
      maxXP = 400;
    }

    // Hitung bonus perfect score untuk token (max token + 50%)
    const perfectToken = maxToken + Math.floor(maxToken * 0.5);
    
    return `Sistem Reward: Hingga ${perfectToken} Token & ${maxXP} XP`;
  }
}
