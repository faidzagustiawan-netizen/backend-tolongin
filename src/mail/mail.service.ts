import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend;
  private isEnabled: boolean;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.isEnabled = true;
    } else {
      this.logger.warn(
        'RESEND_API_KEY tidak ditemukan. Email hanya akan dilog ke konsol.',
      );
      this.isEnabled = false;
    }
  }

  async sendEmail(to: string, subject: string, htmlContent: string) {
    if (!this.isEnabled) {
      this.logger.log(`[MOCK EMAIL] To: ${to} | Subject: ${subject}`);
      return { id: 'mock-id' };
    }

    try {
      const data = await this.resend.emails.send({
        from: 'Tolongin <no-reply@tolongin.co>',
        to,
        subject,
        html: htmlContent,
      });
      this.logger.log(`Email terkirim ke ${to} dengan ID: ${data.data?.id}`);
      return data;
    } catch (error) {
      this.logger.error(`Gagal mengirim email ke ${to}`, error);
      throw error;
    }
  }
}
