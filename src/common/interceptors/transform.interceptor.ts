import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BYPASS_TRANSFORM_KEY } from '../decorators/bypass-transform.decorator';

export interface Response<T> {
  success: boolean;
  message: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T> | T>
{
  constructor(private reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T> | T> {
    const bypass = this.reflector.getAllAndOverride<boolean>(BYPASS_TRANSFORM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (bypass) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        const success = true;
        const message = data?.message || 'Operation successful';
        
        // If the response is just a message, data should be undefined so it's omitted
        const resultData = (data?.message && Object.keys(data).length === 1) 
          ? undefined 
          : (data?.data !== undefined ? data.data : data);
        
        const response: any = { success, message };
        
        // Only include data key if it has a non-null value
        if (resultData !== undefined && resultData !== null) {
          response.data = resultData;
        }
        
        return response;
      }),
    );
  }
}
