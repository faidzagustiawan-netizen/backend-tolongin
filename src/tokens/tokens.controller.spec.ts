import { Test, TestingModule } from '@nestjs/testing';
import { TokensController } from './tokens.controller';
import { TokensService } from './tokens.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

describe('TokensController', () => {
  let controller: TokensController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TokensController],
      providers: [
        { provide: TokensService, useValue: {} },
        { provide: JwtService, useValue: {} },
        // JwtAuthGuard membaca status akun dari basis data, jadi butuh
        // PrismaService meskipun tesnya hanya memeriksa controller ter-instansiasi.
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<TokensController>(TokensController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
