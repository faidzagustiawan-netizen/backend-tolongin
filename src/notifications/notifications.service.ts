import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async sendNotification(userId: string, title: string, content: string, linkUrl?: string) {
    // 1. Simpan di DB
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        title,
        content,
        linkUrl,
      },
    });

    // 2. Broadcast via WebSocket
    this.notificationsGateway.sendNotificationToUser(userId, notification);

    // 2. Coba kirim email
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user && user.email) {
        const htmlContent = `
          <h2>${title}</h2>
          <p>${content}</p>
          ${linkUrl ? `<p><a href="https://frontend-tolongin.vercel.app${linkUrl}">Lihat Detail</a></p>` : ''}
        `;
        await this.mailService.sendEmail(user.email, title, htmlContent);
      }
    } catch (err) {
      console.error('Gagal mengirim email untuk notifikasi', err);
    }

    return notification;
  }

  async getUserNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notifikasi tidak ditemukan');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
