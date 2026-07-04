import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import * as Sentry from '@sentry/node';

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        // Hanya rekam error fatal (500), abaikan error validasi/Not Found (400, 404)
        if (!error.status || error.status >= 500) {
          Sentry.captureException(error);
        }
        throw error;
      }),
    );
  }
}
