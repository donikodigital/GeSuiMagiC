//backend/src/app.smoke.spec.ts
/**
 * Test de fumee de toute l'application (DI, gardes globaux, ValidationPipe, JWT) avec Prisma simule.
 * Sert de filet de securite lors des montees de version de NestJS.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/x';
process.env.JWT_SECRET = 'a'.repeat(40);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(40);

import { Test } from '@nestjs/testing';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

describe('smoke application', () => {
  let app: INestApplication;
  const prismaMock: any = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $on: jest.fn(),
    user: {
      findUnique: jest.fn().mockImplementation(({ where }: any) =>
        where.id === 'u-admin'
          ? { id: 'u-admin', email: 'a@x', role: 'SUPERADMIN', status: 'ACTIVE', clientProfile: null, supervisorProfile: null }
          : null,
      ),
    },
    project: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(prismaMock).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    await app.init();
  });
  afterAll(async () => app.close());

  it('sans jeton -> 401', async () => {
    await request(app.getHttpServer()).get('/api/projects').expect(401);
  });
  it('login avec champ inconnu -> 400', async () => {
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'a@b.co', password: 'x', evil: 1 }).expect(400);
  });
  it('login compte inconnu -> 401', async () => {
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'nobody@b.co', password: 'Whatever123' }).expect(401);
  });
  it('jeton valide -> 200 liste vide', async () => {
    const jwt = app.get(JwtService);
    const token = await jwt.signAsync({ sub: 'u-admin', email: 'a@x', role: 'SUPERADMIN' }, { secret: 'a'.repeat(40), expiresIn: '5m' });
    const res = await request(app.getHttpServer()).get('/api/projects').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
  it('jeton signe avec le secret refresh -> 401', async () => {
    const jwt = app.get(JwtService);
    const token = await jwt.signAsync({ sub: 'u-admin', email: 'a@x', role: 'SUPERADMIN' }, { secret: 'b'.repeat(40), expiresIn: '5m' });
    await request(app.getHttpServer()).get('/api/projects').set('Authorization', `Bearer ${token}`).expect(401);
  });
});
