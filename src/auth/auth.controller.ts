import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Mendaftar akun baru (Talenta atau Perusahaan)' })
  @ApiResponse({
    status: 201,
    description: 'Akun berhasil didaftarkan dan JWT diterbitkan.',
  })
  @ApiResponse({ status: 409, description: 'Email sudah terdaftar.' })
  // Batas global 100/menit terlalu longgar untuk pembuatan akun massal.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @ApiOperation({ summary: 'Mendaftar sebagai anggota tim perusahaan' })
  @ApiResponse({
    status: 201,
    description: 'Akun tim berhasil didaftarkan dan JWT diterbitkan.',
  })
  // Dibatasi ketat agar kode undangan tidak bisa ditebak lewat percobaan beruntun.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register-team')
  async registerTeam(
    @Body() createUserDto: CreateUserDto,
    @Body('inviteCode') inviteCode: string,
  ) {
    return this.authService.registerTeam(createUserDto, inviteCode);
  }

  @ApiOperation({ summary: 'Login pengguna via Email dan Password' })
  @ApiResponse({ status: 200, description: 'Login berhasil, JWT diterbitkan.' })
  @ApiResponse({
    status: 401,
    description: 'Kredensial salah atau tidak valid.',
  })
  // Pertahanan utama terhadap penebakan kata sandi beruntun.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @ApiOperation({ summary: 'Meminta tautan pemulihan kata sandi' })
  @ApiResponse({
    status: 200,
    description:
      'Selalu berhasil. Jawabannya sengaja tidak membedakan email terdaftar dari yang tidak.',
  })
  // Pembatasan ketat: endpoint ini mengirim email dan menerima email sembarang.
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @ApiOperation({ summary: 'Menukar token pemulihan dengan kata sandi baru' })
  @ApiResponse({ status: 200, description: 'Kata sandi berhasil diperbarui.' })
  @ApiResponse({
    status: 400,
    description: 'Token tidak berlaku, sudah dipakai, atau kedaluwarsa.',
  })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
