//backend/src/main.ts
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  // --- Proxy de confiance ---
  // Derriere le proxy de l'hebergeur (Render, Railway...), req.ip vaudrait l'IP
  // du proxy pour TOUS les utilisateurs : le rate-limit (ex: 5 connexions/min)
  // etait alors partage par toute la plateforme et l'IP du journal d'audit
  // etait fausse. `trust proxy` fait lire la vraie IP dans X-Forwarded-For
  // (voir TRUST_PROXY dans .env.example pour regler le nombre de sauts).
  app.set('trust proxy', config.get<boolean | number | string>('trustProxy'));

  // --- Securite (section 44) ---
  app.use(helmet());
  app.enableCors({
    origin: config.get<string[]>('corsOrigins'),
    credentials: true,
  });

  // --- Prefixation Globale API ---
  // Definit le prefixe /api pour toutes les routes backend
  app.setGlobalPrefix('api');

  // Toutes les donnees entrantes sont validees ; le frontend n'est jamais
  // considere comme une couche de securite (section 65).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  const port = config.get<number>('port')!;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Backend demarre sur le port ${port} (env: ${config.get<string>('env')})`);
}

bootstrap();
