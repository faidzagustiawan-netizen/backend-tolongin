import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health & Monitoring')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private memory: MemoryHealthIndicator,
    private prismaHealth: PrismaHealthIndicator,
    private prismaService: PrismaService,
    private disk: DiskHealthIndicator,
  ) {}

  @ApiOperation({
    summary:
      'Memeriksa kesehatan server menyeluruh (Database, Heap, RSS Memory, dan Disk Storage)',
  })
  @ApiResponse({
    status: 200,
    description: 'Sistem dalam kondisi sehat dan siap menerima request.',
  })
  @ApiResponse({
    status: 503,
    description: 'Sistem mengalami kendala pada salah satu indikator.',
  })
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prismaService),
      () => this.memory.checkHeap('memory_heap', 250 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
      () =>
        this.disk.checkStorage('disk_storage', {
          path: process.cwd(),
          thresholdPercent: 0.9,
        }),
    ]);
  }
}
