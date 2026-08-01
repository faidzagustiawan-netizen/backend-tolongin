import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ChallengeStatus,
  TicketStatus,
  VerificationStatus,
} from '@prisma/client';
import { AdminService } from './admin.service';

/**
 * Perilaku moderasi yang paling mahal bila salah.
 *
 * Yang diuji di sini adalah keputusan-keputusan yang konsekuensinya tidak bisa
 * dibatalkan atau tidak terlihat sampai terlambat: takedown yang dulu menghapus
 * portofolio talenta, penulis balasan tiket yang dulu diambil dari badan
 * permintaan, dan jejak audit yang dulu hanya terisi oleh satu jenis tindakan.
 */
describe('AdminService', () => {
  let prisma: any;
  let notifications: any;
  let identityDedupe: any;
  let service: AdminService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      companyProfile: { findUnique: jest.fn(), update: jest.fn() },
      challenge: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      notification: { create: jest.fn() },
      systemAuditLog: { create: jest.fn(), findMany: jest.fn() },
      supportTicket: { findUnique: jest.fn(), update: jest.fn() },
      ticketReply: { create: jest.fn() },
      announcement: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    notifications = { sendNotification: jest.fn() };
    identityDedupe = { clearVector: jest.fn() };

    service = new AdminService(prisma, notifications, identityDedupe);
  });

  describe('takedownChallenge', () => {
    const challenge = {
      id: 'ch-1',
      title: 'Studi Kasus Palsu',
      takenDownAt: null,
      company: { userId: 'user-co' },
      creator: null,
    };

    it('menutup dan menandai, tidak menghapus barisnya', async () => {
      prisma.challenge.findUnique.mockResolvedValue(challenge);
      prisma.challenge.update.mockResolvedValue({ id: 'ch-1' });

      await service.takedownChallenge('admin-1', 'ch-1', 'Melanggar ketentuan');

      // Inti perbaikannya. `challenge.delete` merambat lewat cascade ke
      // `Submission` lalu `Portfolio`: hasil kerja dan portofolio terverifikasi
      // setiap talenta yang pernah ikut ikut terhapus.
      expect(prisma.challenge.delete).not.toHaveBeenCalled();
      expect(prisma.challenge.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ch-1' },
          data: expect.objectContaining({
            status: ChallengeStatus.CLOSED,
            takenDownById: 'admin-1',
            takedownReason: 'Melanggar ketentuan',
            takenDownAt: expect.any(Date),
          }),
        }),
      );
    });

    it('mencatat jejak audit beserta alasannya', async () => {
      prisma.challenge.findUnique.mockResolvedValue(challenge);
      prisma.challenge.update.mockResolvedValue({ id: 'ch-1' });

      await service.takedownChallenge('admin-1', 'ch-1', 'Melanggar ketentuan');

      expect(prisma.systemAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'admin-1',
          action: 'CHALLENGE_TAKEN_DOWN',
          entityType: 'CHALLENGE',
          entityId: 'ch-1',
          details: expect.objectContaining({ reason: 'Melanggar ketentuan' }),
        }),
      });
    });

    it('mengabari pemilik studi kasus', async () => {
      prisma.challenge.findUnique.mockResolvedValue(challenge);
      prisma.challenge.update.mockResolvedValue({ id: 'ch-1' });

      await service.takedownChallenge('admin-1', 'ch-1', 'Melanggar ketentuan');

      expect(notifications.sendNotification).toHaveBeenCalledWith(
        'user-co',
        expect.stringContaining('Diturunkan'),
        expect.stringContaining('Melanggar ketentuan'),
        expect.any(String),
      );
    });

    it('menolak penurunan ganda', async () => {
      prisma.challenge.findUnique.mockResolvedValue({
        ...challenge,
        takenDownAt: new Date(),
      });

      await expect(
        service.takedownChallenge('admin-1', 'ch-1', 'Melanggar ketentuan'),
      ).rejects.toThrow(BadRequestException);
    });

    it('melempar 404 untuk studi kasus yang tidak ada', async () => {
      prisma.challenge.findUnique.mockResolvedValue(null);

      await expect(
        service.takedownChallenge('admin-1', 'hilang', 'apa pun'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('restoreChallenge', () => {
    it('menolak mencabut studi kasus yang tidak sedang diturunkan', async () => {
      prisma.challenge.findUnique.mockResolvedValue({
        id: 'ch-1',
        title: 'X',
        takenDownAt: null,
        company: null,
        creator: null,
      });

      await expect(service.restoreChallenge('admin-1', 'ch-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('membersihkan tanda penurunan tanpa menerbitkan ulang', async () => {
      prisma.challenge.findUnique.mockResolvedValue({
        id: 'ch-1',
        title: 'X',
        takenDownAt: new Date(),
        company: { userId: 'user-co' },
        creator: null,
      });
      prisma.challenge.update.mockResolvedValue({ id: 'ch-1' });

      await service.restoreChallenge('admin-1', 'ch-1');

      const data = prisma.challenge.update.mock.calls[0][0].data;
      expect(data).toEqual({
        takenDownAt: null,
        takenDownById: null,
        takedownReason: null,
      });
      // Menerbitkan ulang adalah keputusan pemiliknya.
      expect(data.status).toBeUndefined();
    });
  });

  describe('replyToTicket', () => {
    const ticket = {
      id: 't-1',
      userId: 'pelapor-1',
      subject: 'Tidak bisa masuk',
      status: TicketStatus.OPEN,
    };

    it('memakai id admin dari token sebagai penulis balasan', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(ticket);
      prisma.ticketReply.create.mockResolvedValue({ id: 'r-1' });

      await service.replyToTicket('admin-1', 't-1', 'Sudah kami cek');

      // Versi lama menerima `userId` dari badan permintaan, sehingga balasan
      // bisa ditulis atas nama pengguna mana pun — termasuk atas nama pelapor.
      expect(prisma.ticketReply.create).toHaveBeenCalledWith({
        data: { ticketId: 't-1', userId: 'admin-1', message: 'Sudah kami cek' },
      });
    });

    it('menaikkan status OPEN menjadi IN_PROGRESS', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(ticket);
      prisma.ticketReply.create.mockResolvedValue({ id: 'r-1' });

      await service.replyToTicket('admin-1', 't-1', 'Sudah kami cek');

      expect(prisma.supportTicket.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: { status: TicketStatus.IN_PROGRESS },
      });
    });

    it('menolak membalas tiket yang sudah ditutup', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue({
        ...ticket,
        status: TicketStatus.CLOSED,
      });

      await expect(
        service.replyToTicket('admin-1', 't-1', 'halo'),
      ).rejects.toThrow(BadRequestException);
    });

    it('mengabari pelapor', async () => {
      prisma.supportTicket.findUnique.mockResolvedValue(ticket);
      prisma.ticketReply.create.mockResolvedValue({ id: 'r-1' });

      await service.replyToTicket('admin-1', 't-1', 'Sudah kami cek');

      expect(notifications.sendNotification).toHaveBeenCalledWith(
        'pelapor-1',
        expect.any(String),
        expect.stringContaining('Tidak bisa masuk'),
        expect.stringContaining('t-1'),
      );
    });
  });

  describe('toggleBanUser', () => {
    it('menolak admin yang memblokir dirinya sendiri', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'admin-1' });

      // `JwtAuthGuard` menolak akun banned pada permintaan berikutnya, jadi ini
      // mengunci admin keluar dari panelnya sendiri.
      await expect(
        service.toggleBanUser('admin-1', 'admin-1', true),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('mencatat audit dan mengabari pengguna', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-9' });
      prisma.user.update.mockResolvedValue({ id: 'user-9', isBanned: true });

      await service.toggleBanUser('admin-1', 'user-9', true, 'Spam');

      expect(prisma.systemAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'USER_BANNED',
          entityId: 'user-9',
          details: { reason: 'Spam' },
        }),
      });
      expect(notifications.sendNotification).toHaveBeenCalledWith(
        'user-9',
        expect.any(String),
        expect.stringContaining('Spam'),
        expect.any(String),
      );
    });
  });

  describe('verifyCompany', () => {
    beforeEach(() => {
      prisma.companyProfile.findUnique.mockResolvedValue({
        id: 'co-1',
        userId: 'user-co',
      });
      prisma.companyProfile.update.mockResolvedValue({ id: 'co-1' });
      prisma.user.update.mockResolvedValue({ id: 'user-co' });
    });

    it('menyalakan isVerified saat disetujui', async () => {
      await service.verifyCompany(
        'admin-1',
        'co-1',
        VerificationStatus.VERIFIED,
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-co' },
        data: { isVerified: true },
      });
    });

    it('mencabut isVerified saat ditolak', async () => {
      // `VerifiedCompanyGuard` membaca `isVerified`, bukan `kybStatus`. Tanpa
      // pencabutan ini perusahaan yang ditinjau ulang lalu ditolak tetap
      // memegang akses penuh.
      await service.verifyCompany(
        'admin-1',
        'co-1',
        VerificationStatus.FAILED,
        'Dokumen buram',
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-co' },
        data: { isVerified: false },
      });
    });

    it('mengabari perusahaan beserta alasan penolakan', async () => {
      await service.verifyCompany(
        'admin-1',
        'co-1',
        VerificationStatus.FAILED,
        'Dokumen buram',
      );

      expect(notifications.sendNotification).toHaveBeenCalledWith(
        'user-co',
        expect.any(String),
        expect.stringContaining('Dokumen buram'),
        expect.any(String),
      );
    });

    it('mencatat jejak audit', async () => {
      await service.verifyCompany(
        'admin-1',
        'co-1',
        VerificationStatus.VERIFIED,
      );

      expect(prisma.systemAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'COMPANY_KYB_APPROVED' }),
      });
    });
  });

  describe('paginasi', () => {
    it('menjepit limit daftar pengguna alih-alih menarik seluruh tabel', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.getAllUsers({ limit: '100000', page: '0' });

      const findManyArgs = prisma.user.findMany.mock.calls[0][0];
      expect(findManyArgs.take).toBe(100);
      expect(findManyArgs.skip).toBe(0);
    });

    it('menyaring pengguna di sisi server, bukan di peramban', async () => {
      prisma.$transaction.mockResolvedValue([[], 0]);

      await service.getAllUsers({ search: 'budi' });

      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { email: { contains: 'budi', mode: 'insensitive' } },
        { fullName: { contains: 'budi', mode: 'insensitive' } },
      ]);
    });
  });
});
