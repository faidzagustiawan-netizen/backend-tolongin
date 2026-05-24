import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DiscussionsService } from './discussions.service';
import { CreateDiscussionDto } from './dto/create-discussion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Discussions & Q&A')
@Controller('challenges/:challengeId/discussions')
export class DiscussionsController {
  constructor(private readonly discussionsService: DiscussionsService) {}

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Menambahkan pesan / pertanyaan baru di forum Q&A studi kasus',
  })
  @ApiResponse({ status: 201, description: 'Pesan berhasil dipublikasikan.' })
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Request() req: any,
    @Param('challengeId') challengeId: string,
    @Body() dto: CreateDiscussionDto,
  ) {
    return this.discussionsService.create(req.user.sub, challengeId, dto);
  }

  @ApiOperation({
    summary: 'Mendapatkan seluruh diskusi dalam sebuah studi kasus',
  })
  @ApiResponse({ status: 200, description: 'Daftar diskusi lengkap.' })
  @Get()
  async getByChallenge(@Param('challengeId') challengeId: string) {
    return this.discussionsService.getByChallenge(challengeId);
  }
}
