import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentStatus, PaymentType, SubscriptionTier } from '@prisma/client';
import * as crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const midtransClient = require('midtrans-client');

@Injectable()
export class PaymentsService {
  private snap: any;

  constructor(private prisma: PrismaService) {
    this.snap = new midtransClient.Snap({
      isProduction: false,
      serverKey: process.env.MIDTRANS_SERVER_KEY || 'dummy_server_key',
      clientKey: process.env.MIDTRANS_CLIENT_KEY || 'dummy_client_key',
    });
  }

  // =====================================
  // TALENT: TOP-UP TOKEN
  // =====================================
  async createTokenTopup(talentId: string, email: string, tokenAmount: number) {
    let price = 0;
    if (tokenAmount === 100) {
      price = 30000;
    } else if (tokenAmount === 500) {
      price = 100000;
    } else {
      price = tokenAmount * 300; 
    }

    const orderId = `topup-${talentId.substring(0, 8)}-${Date.now()}`;

    // 1. Simpan PENDING transaction di DB
    const tx = await this.prisma.paymentTransaction.create({
      data: {
        userId: talentId,
        externalId: orderId, // Kita pakai order_id Midtrans sebagai externalId
        amount: price,
        paymentType: PaymentType.TOKEN_TOPUP,
        metadata: { tokenAmount },
      },
    });

    try {
      // 2. Request ke Midtrans Snap API
      const parameter = {
        transaction_details: {
          order_id: orderId,
          gross_amount: price,
        },
        customer_details: {
          email: email,
        },
        item_details: [
          {
            id: 'TOKEN_PACK',
            price: price,
            quantity: 1,
            name: `Top-up ${tokenAmount} Tokens`,
          },
        ],
      };

      const transaction = await this.snap.createTransaction(parameter);
      
      // 3. Update checkoutUrl dengan redirect_url (opsional jika user tidak pakai pop-up)
      await this.prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: { checkoutUrl: transaction.redirect_url },
      });

      return {
        snapToken: transaction.token,
        redirectUrl: transaction.redirect_url,
        orderId,
      };
    } catch (error) {
      console.error('Midtrans Snap Error:', error);
      throw new InternalServerErrorException('Gagal menghubungi Payment Gateway Midtrans');
    }
  }

  // =====================================
  // COMPANY: SUBSCRIPTION
  // =====================================
  async createSubscription(companyUserId: string, email: string) {
    const price = 2500000; 
    const orderId = `sub-${companyUserId.substring(0, 8)}-${Date.now()}`;

    const tx = await this.prisma.paymentTransaction.create({
      data: {
        userId: companyUserId,
        externalId: orderId,
        amount: price,
        paymentType: PaymentType.SUBSCRIPTION,
        metadata: { plan: 'PROFESSIONAL', durationMonths: 1 },
      },
    });

    try {
      const parameter = {
        transaction_details: {
          order_id: orderId,
          gross_amount: price,
        },
        customer_details: {
          email: email,
        },
        item_details: [
          {
            id: 'PRO_PLAN',
            price: price,
            quantity: 1,
            name: `Langganan Paket Professional (1 Bulan)`,
          },
        ],
      };

      const transaction = await this.snap.createTransaction(parameter);

      await this.prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: { checkoutUrl: transaction.redirect_url },
      });

      return {
        snapToken: transaction.token,
        redirectUrl: transaction.redirect_url,
        orderId,
      };
    } catch (error) {
      console.error('Midtrans Subscription Error:', error);
      throw new InternalServerErrorException('Gagal menghubungi Payment Gateway');
    }
  }

  // =====================================
  // WEBHOOK HANDLER (KEAMANAN SHA-512)
  // =====================================
  async handleMidtransWebhook(payload: any) {
    const { order_id, status_code, gross_amount, signature_key, transaction_status } = payload;
    const serverKey = process.env.MIDTRANS_SERVER_KEY || 'dummy_server_key';

    // 1. Kalkulasi signature manual untuk dicocokkan (Anti-Hacker)
    const rawString = `${order_id}${status_code}${gross_amount}${serverKey}`;
    const hashedSignature = crypto.createHash('sha512').update(rawString).digest('hex');

    if (hashedSignature !== signature_key) {
      console.error('Invalid Webhook Signature. Peringatan Keamanan!');
      throw new UnauthorizedException('Invalid Signature Key');
    }

    // 2. Cari transaksi di DB
    const tx = await this.prisma.paymentTransaction.findUnique({
      where: { externalId: order_id },
    });

    if (!tx) {
      return { message: 'Transaction not found, ignored.' };
    }

    if (tx.status === PaymentStatus.SUCCESS) {
      return { message: 'Transaction already processed.' };
    }

    // 3. Verifikasi Status Pembayaran Midtrans
    if (transaction_status === 'capture' || transaction_status === 'settlement') {
      
      await this.prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: { status: PaymentStatus.SUCCESS },
      });

      if (tx.paymentType === PaymentType.TOKEN_TOPUP) {
        const metadata: any = tx.metadata;
        const addedTokens = metadata?.tokenAmount || 0;

        await this.prisma.talentProfile.update({
          where: { userId: tx.userId },
          data: { tokenBalance: { increment: addedTokens } },
        });

      } else if (tx.paymentType === PaymentType.SUBSCRIPTION) {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        await this.prisma.companyProfile.update({
          where: { userId: tx.userId },
          data: {
            subscriptionTier: SubscriptionTier.KONGLOMERAT,
            subscriptionExpiresAt: expiresAt,
          },
        });
      }
      
      return { success: true };
    } else if (transaction_status === 'expire' || transaction_status === 'cancel' || transaction_status === 'deny') {
      await this.prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: { status: transaction_status === 'expire' ? PaymentStatus.EXPIRED : PaymentStatus.FAILED },
      });
      return { success: true };
    }

    return { message: 'Status pending or challenged, ignored for now.' };
  }
}
