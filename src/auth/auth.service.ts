import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

/** Umur token pemulihan kata sandi. Cukup untuk membuka email, tidak lebih. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async register(createUserDto: CreateUserDto) {
    const user = await this.usersService.create(createUserDto);
    return this.generateToken(user);
  }

  async registerTeam(createUserDto: CreateUserDto, inviteCode: string) {
    const user = await this.usersService.createTeamMember(
      createUserDto,
      inviteCode,
    );
    return this.generateToken(user);
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Email atau password salah');
    }

    if (user.isBanned) {
      throw new UnauthorizedException(
        'Akun Anda telah ditangguhkan (Banned). Silakan hubungi admin.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Email atau password salah');
    }

    return this.generateToken(user);
  }

  /**
   * Menerbitkan tautan pemulihan kata sandi.
   *
   * Jawabannya selalu sama apa pun hasilnya. Membedakan "email terdaftar" dari
   * "tidak terdaftar" di sini mengubah formulir ini menjadi alat pemeriksa
   * keanggotaan — siapa pun bisa memetakan perusahaan mana yang punya akun.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const genericResponse = {
      message:
        'Jika email tersebut terdaftar, tautan pemulihan sudah kami kirimkan.',
    };

    const user = await this.usersService.findByEmail(dto.email);
    if (!user || user.isBanned) {
      return genericResponse;
    }

    // Permintaan baru membatalkan yang lama supaya hanya satu tautan yang
    // hidup pada satu waktu.
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const frontendUrl = (
      this.configService.get<string>('FRONTEND_URL') ||
      'http://localhost:3000'
    ).replace(/\/$/, '');
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    try {
      await this.mailService.sendEmail(
        user.email,
        'Pemulihan Kata Sandi Tolongin',
        `
          <p>Halo,</p>
          <p>Kami menerima permintaan pemulihan kata sandi untuk akun ini.</p>
          <p><a href="${resetUrl}">Atur ulang kata sandi</a></p>
          <p>Tautan berlaku 1 jam dan hanya bisa dipakai sekali.</p>
          <p>Jika Anda tidak meminta ini, abaikan email ini — kata sandi Anda tidak berubah.</p>
        `,
      );
    } catch (error) {
      // Kegagalan kirim tidak boleh membocorkan bahwa emailnya terdaftar.
      this.logger.error(
        `Gagal mengirim email pemulihan kata sandi untuk userId ${user.id}`,
        error as Error,
      );
    }

    return genericResponse;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Tautan pemulihan tidak berlaku atau sudah kedaluwarsa. Silakan minta tautan baru.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      // Seluruh token milik pengguna ini dihapus, bukan hanya yang dipakai.
      this.prisma.passwordResetToken.deleteMany({
        where: { userId: record.userId },
      }),
    ]);

    return { message: 'Kata sandi berhasil diperbarui. Silakan masuk kembali.' };
  }

  private generateToken(user: any) {
    const approvedMembership = user.teamMemberships?.find(
      (m: any) => m.status === 'APPROVED',
    );

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      fullName: user.fullName,
      profileId:
        user.talentProfile?.id ||
        user.companyProfile?.id ||
        approvedMembership?.companyId,
      memberRole: approvedMembership?.role || (user.companyProfile ? 'OWNER' : undefined),
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isVerified: user.isVerified,
        profile:
          user.talentProfile ||
          user.companyProfile ||
          (approvedMembership
            ? { ...approvedMembership.company, isTeamMember: true, memberRole: approvedMembership.role }
            : null),
      },
    };
  }
}
