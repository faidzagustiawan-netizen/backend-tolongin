import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Skills')
@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mencari skill' })
  @Get()
  searchSkills(@Query('q') query: string) {
    return this.skillsService.searchSkills(query);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Membuat skill baru di directory' })
  @Post()
  createSkill(@Body('name') name: string) {
    return this.skillsService.createSkill(name);
  }
}
