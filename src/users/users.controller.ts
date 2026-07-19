import {
  Controller,
  Get,
  Param,
  UseGuards,
  Patch,
  Body,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('User & Profile Management')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Mendapatkan profil publik/privat pengguna beserta rekam jejak portofolio',
  })
  @ApiResponse({ status: 200, description: 'Detail profil pengguna.' })
  @ApiResponse({ status: 404, description: 'Pengguna tidak ditemukan.' })
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getProfile(@Param('id') id: string, @Request() req: any) {
    const user = await this.usersService.findById(id);
    const { passwordHash, ...safeUser } = user;

    // Jika bukan pemilik profil, hapus data biometrik/KTP privat
    if (req.user.sub !== id && safeUser.talentProfile) {
      const tp = safeUser.talentProfile as any;
      delete tp.encryptedPrivateFace;
      delete tp.encryptedKtpData;
      delete tp.biometricDataHash;
      delete tp.biometricFeatureVector;
    }

    return safeUser;
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Memperbarui profil pengguna saat ini',
  })
  @ApiResponse({ status: 200, description: 'Profil berhasil diperbarui.' })
  @UseGuards(JwtAuthGuard)
  @Patch('me/profile')
  async updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
    const userId = req.user.sub;
    const updatedUser = await this.usersService.updateProfile(userId, dto);
    const { passwordHash, ...safeUser } = updatedUser;
    return safeUser;
  }
}
