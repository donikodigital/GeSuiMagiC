//backend/src/main.ts
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

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