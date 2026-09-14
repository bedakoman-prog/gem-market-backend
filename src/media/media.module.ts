import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { STORAGE_SERVICE } from './storage/storage.interface';
import { LocalDiskStorageService } from './storage/local-disk-storage.service';
import { S3StorageService } from './storage/s3-storage.service';

// Sélection de l'implémentation de stockage selon STORAGE_DRIVER (section 2 :
// disque local accepté en développement uniquement, S3-compatible en
// production — voir storage/storage.interface.ts).
@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    LocalDiskStorageService,
    S3StorageService,
    {
      provide: STORAGE_SERVICE,
      useFactory: (config: ConfigService, local: LocalDiskStorageService, s3: S3StorageService) =>
        config.get<string>('STORAGE_DRIVER') === 's3' ? s3 : local,
      inject: [ConfigService, LocalDiskStorageService, S3StorageService],
    },
  ],
})
export class MediaModule {}
