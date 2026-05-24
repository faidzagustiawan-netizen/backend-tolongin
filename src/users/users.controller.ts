import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
  async getProfile(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }
}
