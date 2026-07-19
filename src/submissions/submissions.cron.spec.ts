import { Test, TestingModule } from '@nestjs/testing';
import { SubmissionsCronService } from './submissions.cron';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChallengeType } from '@prisma/client';

describe('SubmissionsCronService', () => {
  let service: SubmissionsCronService;
  let prisma: PrismaService;
  let aiService: AiService;
  let notifications: NotificationsService;

  const mockPrisma = {
    submission: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockAiService = {
    evaluateComponents: jest.fn(),
  };

  const mockNotifications = {
    sendNotification: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubmissionsCronService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AiService, useValue: mockAiService },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<SubmissionsCronService>(SubmissionsCronService);
    prisma = module.get<PrismaService>(PrismaService);
    aiService = module.get<AiService>(AiService);
    notifications = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should process pending AI submissions', async () => {
    // Setup Mock Data
    const mockSubmission = {
      id: 'sub-1',
      enrollmentId: 'enr-1',
      enrollment: {
        talentId: 'talent-1',
        challengeId: 'chall-1',
        talent: { userId: 'user-1' },
        challenge: {
          title: 'Test Challenge',
          category: 'Test',
          challengeType: ChallengeType.COMPANY,
          components: [{ id: 'comp-1', question: 'Q1', points: 10 }],
          sections: [],
          gradingRubric: { code_quality: 5 },
        },
      },
      componentResponses: [
        { componentId: 'comp-1', textValue: 'My code here' },
      ],
    };

    mockPrisma.submission.findMany.mockResolvedValue([mockSubmission]);

    // Provide a basic mock implementation for transaction
    (mockPrisma as any).$transaction = jest
      .fn()
      .mockImplementation(async (cb) => {
        return cb(mockPrisma); // passing the same prisma instance so nested calls work
      });

    mockAiService.evaluateComponents.mockResolvedValue({
      aiPlagiarismScore: 0,
      aiCorrectionSummary: 'Good',
      aiScore: 85,
    });

    // Execute Method
    await service.handleAiEvaluations();

    // Verify Expectations
    expect(prisma.submission.findMany).toHaveBeenCalled();
    expect(aiService.evaluateComponents).toHaveBeenCalled();

    expect(prisma.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({ status: 'UNDER_REVIEW', aiScore: 85 }),
      }),
    );
  });
});
