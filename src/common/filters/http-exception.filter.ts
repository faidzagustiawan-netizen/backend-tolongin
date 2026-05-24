import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Terjadi kesalahan internal pada server.';
    let errorCode = 'INTERNAL_SERVER_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resHost = exception.getResponse();
      message =
        typeof resHost === 'string'
          ? resHost
          : (resHost as any).message || resHost;
      errorCode = (resHost as any).error || HttpStatus[status];
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      status = HttpStatus.BAD_REQUEST;
      errorCode = `PRISMA_DB_ERROR_${exception.code}`;
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message =
          'Data yang Anda masukkan sudah terdaftar (terjadi duplikasi unik).';
      } else {
        message = `Kesalahan basis data: ${exception.message.split('\n').pop()}`;
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      errorCode = 'PRISMA_VALIDATION_ERROR';
      message =
        'Struktur data yang dikirim tidak sesuai dengan skema database.';
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    response.status(status).json({
      success: false,
      timestamp: new Date().toISOString(),
      path: request.url,
      errorCode,
      message,
    });
  }
}
