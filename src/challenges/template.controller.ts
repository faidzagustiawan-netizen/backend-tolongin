import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ChallengesService } from './challenges.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { VerifiedCompanyGuard } from '../auth/guards/verified-company.guard';
import { Role } from '@prisma/client';

@ApiTags('Challenge Templates (Role-Based Bank)')
@Controller('templates')
export class TemplateController {
  constructor(private readonly challengesService: ChallengesService) {}

  @ApiOperation({
    summary: 'Mendapatkan daftar semua Template Role',
  })
  @ApiResponse({ status: 200, description: 'Daftar template role aktif.' })
  @Get()
  async getTemplates() {
    return this.challengesService.getTemplates();
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: '1-Click Clone Template menjadi Challenge Perusahaan',
  })
  @ApiResponse({ status: 201, description: 'Template berhasil dikloning menjadi DRAFT.' })
  @ApiResponse({ status: 404, description: 'Template tidak ditemukan.' })
  @UseGuards(JwtAuthGuard, RolesGuard, VerifiedCompanyGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  @Post(':id/clone')
  async cloneTemplate(@Param('id') id: string, @Request() req: any) {
    const companyId = req.user.profileId;
    return this.challengesService.cloneTemplate(id, companyId, req.user.sub);
  }
}
