import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';

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
  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @ApiOperation({ summary: 'Mendaftar sebagai anggota tim perusahaan' })
  @ApiResponse({
    status: 201,
    description: 'Akun tim berhasil didaftarkan dan JWT diterbitkan.',
  })
  @Post('register-team')
  async registerTeam(
    @Body() createUserDto: CreateUserDto,
    @Body('inviteCode') inviteCode: string
  ) {
    return this.authService.registerTeam(createUserDto, inviteCode);
  }

  @ApiOperation({ summary: 'Login pengguna via Email dan Password' })
  @ApiResponse({ status: 200, description: 'Login berhasil, JWT diterbitkan.' })
  @ApiResponse({
    status: 401,
    description: 'Kredensial salah atau tidak valid.',
  })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}
