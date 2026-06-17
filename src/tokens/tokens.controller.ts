import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { TokensService } from './tokens.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('tokens')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Get('balance')
  @Roles('TALENT')
  async getBalance(@Request() req: any) {
    return this.tokensService.getBalance(req.user.sub);
  }

  @Get('history')
  @Roles('TALENT')
  async getHistory(@Request() req: any) {
    return this.tokensService.getTransactionHistory(req.user.sub);
  }

  @Post('topup')
  @Roles('TALENT')
  async topUp(@Request() req: any, @Body() body: { amount: number }) {
    return this.tokensService.topUp(req.user.sub, body.amount);
  }
}
