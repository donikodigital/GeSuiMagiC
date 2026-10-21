//backend/src/common/filters/http-exception.filter.spec.ts
import { BadRequestException, HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HttpExceptionFilter, mapPrismaError } from './http-exception.filter';
import { AppException } from '../exceptions/app.exception';

const prismaError = (code: string) => new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test' });

describe('mapPrismaError', () => {
  it.each([
    ['P2025', 404, 'NOT_FOUND'],
    ['P2002', 409, 'DUPLICATE_ENTRY'],
    ['P2003', 400, 'INVALID_REFERENCE'],
    ['P2034', 409, 'CONCURRENT_UPDATE'],
    ['P2000', 400, 'VALUE_OUT_OF_RANGE'],
    ['P2020', 400, 'VALUE_OUT_OF_RANGE'],
  ])('%s -> %i %s', (code, status, mappedCode) => {
    expect(mapPrismaError(prismaError(code))).toMatchObject({ status, code: mappedCode });
  });

  it('renvoie null pour une erreur non prevue (traitee comme 500)', () => {
    expect(mapPrismaError(prismaError('P9999'))).toBeNull();
  });
});

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  function run(exception: unknown) {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host: any = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'GET', url: '/api/test' }),
      }),
    };
    filter.catch(exception, host);
    return { status: status.mock.calls[0][0] as number, body: json.mock.calls[0][0] };
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('AppException : conserve statut, code et message metier', () => {
    const { status, body } = run(AppException.projectNotActive('SUSPENDED'));

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body).toMatchObject({ success: false, code: 'PROJECT_NOT_ACTIVE', path: '/api/test' });
  });

  it('HttpException de validation : agrege les messages', () => {
    const { status, body } = run(new BadRequestException({ message: ['amount doit etre positif', 'date invalide'] }));

    expect(status).toBe(400);
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.message).toBe('amount doit etre positif ; date invalide');
  });

  it('HttpException simple : code derive du statut', () => {
    expect(run(new NotFoundException('Introuvable')).body.code).toBe('NOT_FOUND');
  });

  it('erreur Prisma prevue : traduite en vrai code HTTP', () => {
    const { status, body } = run(prismaError('P2002'));

    expect(status).toBe(409);
    expect(body.code).toBe('DUPLICATE_ENTRY');
  });

  it("erreur inattendue : message generique, AUCUNE fuite de details internes", () => {
    const { status, body } = run(new Error('connection to db 10.0.0.5 failed: password=secret'));

    expect(status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
  });

  it('erreur Prisma non geree : 500 generique sans le message brut', () => {
    const { status, body } = run(prismaError('P9999'));

    expect(status).toBe(500);
    expect(body.message).not.toContain('boom');
  });
});
