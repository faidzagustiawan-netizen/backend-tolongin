import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role, TicketStatus } from '@prisma/client';
import { SupportService } from './support.service';

describe('SupportService', () => {
  let prisma: any;
  let notifications: any;
  let service: SupportService;

  beforeEach(() => {
    prisma = {
      supportTicket: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      ticketReply: { create: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    notifications = { sendNotification: jest.fn() };

    service = new SupportService(prisma, notifications);
  });

  describe('createTicket', () => {
    it('menyimpan tiket atas nama pemanggil', async () => {
      prisma.supportTicket.create.mockResolvedValue({
        id: 't-1',
        subject: 'Halo',
      });

      await service.createTicket('user-1', {
        subject: 'Tidak bisa masuk',
        description: 'Sudah reset kata sandi tapi tetap gagal.',
      });

      expect(prisma.supportTicket.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          subject: 'Tidak bisa masuk',
          description: 'Sudah reset kata sandi tapi tetap gagal.',
        },
      });
    });

    it('menahan akun yang sudah punya lima tiket belum selesai', async () => {
      prisma.supportTicket.count.mockResolvedValue(5);

      await expect(
        service.createTicket('user-1', { subject: 'a', description: 'b' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.supportTicket.create).not.toHaveBeenCalled();
    });

    it('hanya menghitung tiket yang belum selesai', async () => {
      prisma.supportTicket.create.mockResolvedValue({
        id: 't-1',
        subject: 'Halo',
      });

      await service.createTicket('user-1', { subject: 'a', description: 'b' });

      expect(prisma.supportTicket.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
        },
      });
    });

    it('mengabari setiap admin yang tidak diblokir', async () => {
      prisma.supportTicket.create.mockResolvedValue({
        id: 't-1',
        subject: 'Halo',
      });
      prisma.user.findMany.mockResolvedValue([
        { id: 'admin-1' },
        { id: 'admin-2' },
      ]);

      await service.createTicket('user-1', { subject: 'a', description: 'b' });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: Role.ADMIN, isBanned: false },
        select: { id: true },
      });
      expect(notifications.sendNotification).toHaveBeenCalledTimes(2);
    });
  });

  describe('getMyTicket', () => {
    it('menolak tiket milik pengguna lain', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({
        id: 't-1',
        userId: 'orang-lain',
        replies: [],
      });

      await expect(service.getMyTicket('user-1', 't-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('melempar 404 untuk tiket yang tidak ada', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(null);

      await expect(service.getMyTicket('user-1', 'hilang')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('replyToMyTicket', () => {
    it('menolak membalas tiket orang lain', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({
        id: 't-1',
        userId: 'orang-lain',
        status: TicketStatus.OPEN,
        subject: 'X',
      });

      await expect(
        service.replyToMyTicket('user-1', 't-1', 'halo'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('menolak membalas tiket yang sudah ditutup', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({
        id: 't-1',
        userId: 'user-1',
        status: TicketStatus.CLOSED,
        subject: 'X',
      });

      await expect(
        service.replyToMyTicket('user-1', 't-1', 'halo'),
      ).rejects.toThrow(BadRequestException);
    });

    it('menyimpan balasan atas nama pemiliknya', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({
        id: 't-1',
        userId: 'user-1',
        status: TicketStatus.IN_PROGRESS,
        subject: 'X',
      });
      prisma.ticketReply.create.mockResolvedValue({ id: 'r-1' });

      await service.replyToMyTicket('user-1', 't-1', 'masih bermasalah');

      expect(prisma.ticketReply.create).toHaveBeenCalledWith({
        data: {
          ticketId: 't-1',
          userId: 'user-1',
          message: 'masih bermasalah',
        },
      });
    });
  });
});
