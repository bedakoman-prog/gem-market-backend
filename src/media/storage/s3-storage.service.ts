import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
// aws4 signe une requête HTTP "brute" façon Signature V4 — volontairement
// préféré au SDK AWS complet (beaucoup plus lourd) pour rester compatible
// avec n'importe quel service objet S3-compatible (section 2 : "AWS S3, ou
// alternative moins chère type Backblaze B2 / OVH Object Storage").
import * as aws4 from 'aws4';
import { StorageService, UploadResult } from './storage.interface';

@Injectable()
export class S3StorageService implements StorageService {
  private readonly logger = new Logger('S3Storage');

  constructor(private config: ConfigService) {}

  private get creds() {
    return {
      accessKeyId: this.config.get<string>('STORAGE_S3_ACCESS_KEY_ID') ?? '',
      secretAccessKey: this.config.get<string>('STORAGE_S3_SECRET_ACCESS_KEY') ?? '',
    };
  }

  // Construit host/path selon qu'on parle à AWS S3 (bucket en sous-domaine)
  // ou à un endpoint S3-compatible tiers (Backblaze/OVH), fourni tel quel
  // via STORAGE_S3_ENDPOINT.
  private target(key: string) {
    const bucket = this.config.get<string>('STORAGE_S3_BUCKET');
    const region = this.config.get<string>('STORAGE_S3_REGION') ?? 'us-east-1';
    const customEndpoint = this.config.get<string>('STORAGE_S3_ENDPOINT');

    if (customEndpoint) {
      const host = customEndpoint.replace(/^https?:\/\//, '');
      return { host, path: `/${bucket}/${key}`, region };
    }
    return { host: `${bucket}.s3.${region}.amazonaws.com`, path: `/${key}`, region };
  }

  async upload({ buffer, key, contentType }: { buffer: Buffer; key: string; contentType: string }): Promise<UploadResult> {
    const { accessKeyId, secretAccessKey } = this.creds;
    if (!accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException(
        "STORAGE_DRIVER=s3 mais STORAGE_S3_ACCESS_KEY_ID/SECRET_ACCESS_KEY ne sont pas configurés.",
      );
    }
    const { host, path: reqPath, region } = this.target(key);

    const opts: aws4.Request = {
      host,
      path: reqPath,
      method: 'PUT',
      service: 's3',
      region,
      headers: { 'Content-Type': contentType, 'x-amz-acl': 'public-read' },
      body: buffer,
    };
    aws4.sign(opts, this.creds);

    try {
      await axios.put(`https://${host}${reqPath}`, buffer, { headers: opts.headers as Record<string, string> });
    } catch (err) {
      this.logger.error(`Échec de l'upload S3 pour ${key}`, err as Error);
      throw new InternalServerErrorException("Échec de l'envoi du fichier vers le stockage objet.");
    }

    // Attention : STORAGE_S3_PUBLIC_BASE_URL pointe vers la racine du bucket
    // (URL publique r2.dev, ou domaine personnalisé branché sur le bucket) —
    // il ne faut donc JAMAIS y rajouter le nom du bucket comme dans reqPath
    // (qui lui sert à l'API S3 "path-style"). Sans base publique configurée,
    // on retombe sur l'URL de l'API S3 elle-même (accessible seulement si le
    // token a les droits de lecture, donc surtout utile en développement).
    const publicBase = this.config.get<string>('STORAGE_S3_PUBLIC_BASE_URL');
    const url = publicBase
      ? `${publicBase.replace(/\/$/, '')}/${key}`
      : `https://${host}${reqPath}`;
    return { url, storageKey: key };
  }

  async remove(storageKey: string): Promise<void> {
    const { accessKeyId, secretAccessKey } = this.creds;
    if (!accessKeyId || !secretAccessKey) return;
    const { host, path: reqPath, region } = this.target(storageKey);

    const opts: aws4.Request = { host, path: reqPath, method: 'DELETE', service: 's3', region };
    aws4.sign(opts, this.creds);

    try {
      await axios.delete(`https://${host}${reqPath}`, { headers: opts.headers as Record<string, string> });
    } catch (err) {
      this.logger.warn(`Échec de la suppression S3 pour ${storageKey} : ${(err as Error).message}`);
    }
  }
}
