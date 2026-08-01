import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTicketDto } from './dto/support.dto';

/**
 * Sisi pengguna dari tiket bantuan.
 *
 * Panel admin untuk tiket sudah ada sejak lama, lengkap dengan daftar,
 * balasan, dan penutupan — tetapi tidak ada satu pun endpoint yang bisa
 * *membuat* tiket. `SupportTicket` hanya pernah disebut di `AdminService`,
 * sehingga panelnya tidak mungkin berisi apa pun kecuali baris yang
 * disisipkan langsung ke basis data.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Berapa tiket terbuka yang boleh dimiliki satu akun sekaligus. */
  private static readonly MAX_OPEN_TICKETS = 5;

  async createTicket(userId: string, dto: CreateTicketDto) {
    // Tanpa batas ini satu akun bisa membanjiri antrean admin dengan tiket
    // kosong lebih cepat daripada siapa pun sanggup menutupnya.
    const openCount = await this.prisma.supportTicket.count({
      where: {
        userId,
        status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
      },
    });

    if (openCount >= SupportService.MAX_OPEN_TICKETS) {
      throw new BadRequestException(
        `Anda sudah punya ${SupportService.MAX_OPEN_TICKETS} tiket yang belum selesai. Tunggu balasan tim dukungan lebih dulu.`,
      );
    }

    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        subject: dto.subject,
        description: dto.description,
      },
    });

    await this.notifyAdmins(
      'Tiket Bantuan Baru',
      `Tiket baru: "${ticket.subject}".`,
      '/admin/tickets',
    );

    return ticket;
  }

  async listMyTickets(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { userId },
      include: { _count: { select: { replies: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getMyTicket(userId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        replies: {
          include: { user: { select: { fullName: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Tiket tidak ditemukan');
    // Tiket memuat keluhan beserta data akun pelapor; id-nya UUID, tapi
    // kepemilikan tetap diperiksa, bukan diandalkan pada sulitnya menebak.
    if (ticket.userId !== userId) {
      throw new ForbiddenException('Tiket ini bukan milik Anda.');
    }

    return ticket;
  }

  async replyToMyTicket(userId: string, ticketId: string, message: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, userId: true, status: true, subject: true },
    });

    if (!ticket) throw new NotFoundException('Tiket tidak ditemukan');
    if (ticket.userId !== userId) {
      throw new ForbiddenException('Tiket ini bukan milik Anda.');
    }
    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException(
        'Tiket ini sudah ditutup. Silakan buat tiket baru.',
      );
    }

    const reply = await this.prisma.ticketReply.create({
      data: { ticketId, userId, message },
    });

    await this.notifyAdmins(
      'Balasan Tiket Bantuan',
      `Pelapor membalas tiket "${ticket.subject}".`,
      '/admin/tickets',
    );

    return reply;
  }

  /**
   * Mengabari seluruh akun admin.
   *
   * Tanpa ini tiket baru hanya terlihat oleh admin yang kebetulan sedang
   * membuka halamannya.
   */
  private async notifyAdmins(title: string, content: string, linkUrl: string) {
    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, isBanned: false },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.sendNotification(
          admin.id,
          title,
          content,
          linkUrl,
        ),
      ),
    );
  }
}
