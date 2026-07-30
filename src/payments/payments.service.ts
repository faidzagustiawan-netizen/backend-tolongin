import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentStatus, PaymentType, SubscriptionTier } from '@prisma/client';
import {
  CreateSubscriptionDto,
  SUBSCRIPTION_MONTHLY_PRICE,
} from './dto/create-subscription.dto';
import * as crypto from 'crypto';

const midtransClient = require('midtrans-client');

@Injectable()
export class PaymentsService {
  private snap: any;
  private readonly serverKey: string;

  constructor(private prisma: PrismaService) {
    // Tidak ada nilai cadangan. Server key dipakai untuk memverifikasi tanda
    // tangan webhook; kalau nilainya bisa ditebak (apalagi tertulis di source),
    // siapa pun dapat memalsukan notifikasi pembayaran berhasil.
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    const clientKey = process.env.MIDTRANS_CLIENT_KEY;

    if (!serverKey || !clientKey) {
      throw new Error(
        'MIDTRANS_SERVER_KEY dan MIDTRANS_CLIENT_KEY wajib diisi. ' +
          'Kunci bawaan tidak disediakan karena dipakai untuk verifikasi webhook.',
      );
    }

    this.serverKey = serverKey;
    this.snap = new midtransClient.Snap({
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
      serverKey,
      clientKey,
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
      throw new InternalServerErrorException(
        'Gagal menghubungi Payment Gateway Midtrans',
      );
    }
  }

  // =====================================
  // COMPANY: SUBSCRIPTION
  // =====================================
  async createSubscription(
    companyUserId: string,
    email: string,
    dto: CreateSubscriptionDto = {},
  ) {
    const tier = dto.tier ?? SubscriptionTier.KONGLOMERAT;
    const durationMonths = dto.durationMonths ?? 1;

    // Tier CUSTOM dinegosiasikan manual, tidak boleh lewat checkout mandiri.
    if (!(tier in SUBSCRIPTION_MONTHLY_PRICE)) {
      throw new BadRequestException(
        `Paket ${tier} tidak tersedia untuk pembelian mandiri. Hubungi tim penjualan.`,
      );
    }

    const price = SUBSCRIPTION_MONTHLY_PRICE[tier] * durationMonths;
    const orderId = `sub-${companyUserId.substring(0, 8)}-${Date.now()}`;

    const tx = await this.prisma.paymentTransaction.create({
      data: {
        userId: companyUserId,
        externalId: orderId,
        amount: price,
        paymentType: PaymentType.SUBSCRIPTION,
        metadata: { tier, durationMonths },
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
            id: `PLAN_${tier}`,
            price: SUBSCRIPTION_MONTHLY_PRICE[tier],
            quantity: durationMonths,
            name: `Langganan Paket ${tier} (per bulan)`,
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
      throw new InternalServerErrorException(
        'Gagal menghubungi Payment Gateway',
      );
    }
  }

  // =====================================
  // WEBHOOK HANDLER (KEAMANAN SHA-512)
  // =====================================
  async handleMidtransWebhook(payload: any) {
    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
    } = payload;
    // 1. Kalkulasi signature manual untuk dicocokkan (Anti-Hacker)
    const rawString = `${order_id}${status_code}${gross_amount}${this.serverKey}`;
    const hashedSignature = crypto
      .createHash('sha512')
      .update(rawString)
      .digest('hex');

    // timingSafeEqual mencegah kebocoran informasi lewat perbedaan waktu
    // perbandingan string. Panjang harus dicek dulu karena fungsinya melempar
    // galat bila kedua buffer berbeda ukuran.
    const expected = Buffer.from(hashedSignature, 'utf8');
    const received = Buffer.from(String(signature_key ?? ''), 'utf8');

    if (
      expected.length !== received.length ||
      !crypto.timingSafeEqual(expected, received)
    ) {
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
    if (
      transaction_status === 'capture' ||
      transaction_status === 'settlement'
    ) {
      await this.prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: { status: PaymentStatus.SUCCESS },
      });

      // Pembayarannya sudah diterima Midtrans, jadi kegagalan menaruh hasilnya
      // ke profil tidak boleh melempar galat: Midtrans akan mengulang webhook
      // dan pengulangannya berhenti di penjaga "already processed" di atas.
      // Yang dibutuhkan adalah catatan yang keras supaya kasusnya bisa
      // diselesaikan manual — bukan `update` yang melempar P2025 diam-diam
      // karena profilnya memang tidak ada.
      if (tx.paymentType === PaymentType.TOKEN_TOPUP) {
        const metadata: any = tx.metadata;
        const addedTokens = metadata?.tokenAmount || 0;

        const credited = await this.prisma.talentProfile.updateMany({
          where: { userId: tx.userId },
          data: { tokenBalance: { increment: addedTokens } },
        });

        if (credited.count === 0) {
          console.error(
            `Top-up ${order_id} lunas tetapi userId ${tx.userId} tidak punya TalentProfile. Perlu penanganan manual.`,
          );
        }
      } else if (tx.paymentType === PaymentType.SUBSCRIPTION) {
        const metadata: any = tx.metadata;
        const tier: SubscriptionTier =
          metadata?.tier ?? SubscriptionTier.KONGLOMERAT;
        const durationMonths: number = Number(metadata?.durationMonths) || 1;

        const current = await this.prisma.companyProfile.findUnique({
          where: { userId: tx.userId },
          select: { subscriptionExpiresAt: true },
        });

        // Perpanjangan menumpuk dari sisa masa aktif, bukan menghanguskannya.
        const now = new Date();
        const base =
          current?.subscriptionExpiresAt && current.subscriptionExpiresAt > now
            ? new Date(current.subscriptionExpiresAt)
            : now;
        base.setMonth(base.getMonth() + durationMonths);

        const activated = await this.prisma.companyProfile.updateMany({
          where: { userId: tx.userId },
          data: {
            subscriptionTier: tier,
            subscriptionExpiresAt: base,
          },
        });

        if (activated.count === 0) {
          console.error(
            `Langganan ${order_id} lunas tetapi userId ${tx.userId} tidak punya CompanyProfile — kemungkinan akun undangan. Perlu penanganan manual.`,
          );
        }
      }

      return { success: true };
    } else if (
      transaction_status === 'expire' ||
      transaction_status === 'cancel' ||
      transaction_status === 'deny'
    ) {
      await this.prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: {
          status:
            transaction_status === 'expire'
              ? PaymentStatus.EXPIRED
              : PaymentStatus.FAILED,
        },
      });
      return { success: true };
    }

    return { message: 'Status pending or challenged, ignored for now.' };
  }
}
