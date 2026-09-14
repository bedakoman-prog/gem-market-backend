import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(helmet({ crossOriginResourcePolicy: false })); // sinon Helmet bloque le chargement des médias /media par le front
  app.enableCors(); // à restreindre à l'origine de la PWA en production

  // Sert les fichiers uploadés en mode STORAGE_DRIVER=local (développement
  // uniquement — voir src/media/storage/local-disk-storage.service.ts).
  if ((process.env.STORAGE_DRIVER ?? 'local') === 'local') {
    app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/media/' });
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  Logger.log(`GEM Market backend démarré sur http://localhost:${port}`, 'Bootstrap');
}

bootstrap();
