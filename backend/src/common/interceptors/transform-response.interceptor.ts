import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Enveloppe toutes les reponses reussies dans un format stable :
 * { success: true, data: ... }
 * Symetrique avec HttpExceptionFilter qui renvoie { success: false, ... }.
 */
@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        // Laisse passer tel quel les reponses binaires (PDF/Excel en stream) deja envoyees via res.send()
        if (data && data.__raw) return data.payload;
        return { success: true, data: data ?? null };
      }),
    );
  }
}
