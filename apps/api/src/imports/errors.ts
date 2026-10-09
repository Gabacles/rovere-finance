import { randomUUID } from 'node:crypto';
import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ImportErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const payload = error instanceof HttpException ? error.getResponse() : {};
    if (status === 500) console.warn('IMPORT_API_FAILED');
    host.switchToHttp().getResponse<Response>().status(status).json(typeof payload === 'object' && 'code' in payload ? payload : {
      code: status === 500 ? 'IMPORT_UNAVAILABLE' : status === 413 ? 'FILE_TOO_LARGE' : status === 401 ? 'UNAUTHORIZED' : 'INVALID_REQUEST',
      message: status === 500 ? 'Não foi possível concluir. Tente novamente.' : status === 413 ? 'O arquivo excede 10 MiB.' : status === 401 ? 'Sessão inválida ou expirada.' : 'Confira o arquivo e os campos enviados.', requestId: randomUUID(),
    });
  }
}
