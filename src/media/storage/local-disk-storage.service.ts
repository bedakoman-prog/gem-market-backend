import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageService, UploadResult } from './storage.interface';

// Stockage de secours pour développer sans compte S3 : écrit dans
// ./uploads (servi statiquement par Express, voir main.ts). À ne PAS
// utiliser en production (le cahier des charges est explicite là-dessus —
// section 2) : configurer STORAGE_DRIVER=s3 avant tout déploiement réel.
@Injectable()
export class LocalDiskStorageService implements StorageService {
  private readonly logger = new Logger('LocalDiskStorage');
  private readonly root: string;
  private readonly publicBaseUrl: string;

  constructor(private config: ConfigService) {
    this.root = path.resolve(process.cwd(), 'uploads');
    this.publicBaseUrl = this.config.get<string>('PUBLIC_BASE_URL') ?? `http://localhost:${this.config.get('PORT') ?? 3000}`;
  }

  async upload({ buffer, key, contentType }: { buffer: Buffer; key: string; contentType: string }): Promise<UploadResult> {
    void contentType;
    const filePath = path.join(this.root, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    this.logger.log(`Fichier écrit localement : ${filePath} (mode dev uniquement)`);
    return { url: `${this.publicBaseUrl}/media/${key}`, storageKey: key };
  }

  async remove(storageKey: string): Promise<void> {
    const filePath = path.join(this.root, storageKey);
    await fs.rm(filePath, { force: true });
  }
}
