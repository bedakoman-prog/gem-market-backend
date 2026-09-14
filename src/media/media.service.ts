import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaType } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from './storage/storage.interface';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_PHOTOS_PER_LISTING = 8;
const MAX_VIDEOS_PER_LISTING = 2;

@Injectable()
export class MediaService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private storage: StorageService,
    private config: ConfigService,
  ) {}

  async addToListing(listingId: string, sellerId: string, file: Express.Multer.File) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Annonce introuvable');
    if (listing.sellerId !== sellerId) throw new ForbiddenException("Cette annonce ne vous appartient pas");

    const type = this.resolveType(file.mimetype);
    this.assertSize(type, file.size);
    await this.assertQuota(listingId, type);

    const key = `listings/${listingId}/${uuid()}${this.extensionFor(file.mimetype)}`;
    const { url, storageKey } = await this.storage.upload({
      buffer: file.buffer,
      key,
      contentType: file.mimetype,
    });

    const count = await this.prisma.listingMedia.count({ where: { listingId } });

    return this.prisma.listingMedia.create({
      data: { listingId, type, url, storageKey, position: count },
    });
  }

  async remove(listingId: string, sellerId: string, mediaId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Annonce introuvable');
    if (listing.sellerId !== sellerId) throw new ForbiddenException("Cette annonce ne vous appartient pas");

    const media = await this.prisma.listingMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.listingId !== listingId) throw new NotFoundException('Média introuvable');

    await this.storage.remove(media.storageKey);
    await this.prisma.listingMedia.delete({ where: { id: mediaId } });
    return { removed: true };
  }

  private resolveType(mimetype: string): MediaType {
    if (ALLOWED_IMAGE_TYPES.includes(mimetype)) return MediaType.photo;
    if (ALLOWED_VIDEO_TYPES.includes(mimetype)) return MediaType.video;
    throw new BadRequestException(
      `Type de fichier non supporté (${mimetype}). Formats acceptés : ${[...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].join(', ')}.`,
    );
  }

  private extensionFor(mimetype: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'video/quicktime': '.mov',
      'video/webm': '.webm',
    };
    return map[mimetype] ?? '';
  }

  private assertSize(type: MediaType, sizeBytes: number) {
    const maxImageMb = Number(this.config.get('MEDIA_MAX_IMAGE_MB') ?? 8);
    const maxVideoMb = Number(this.config.get('MEDIA_MAX_VIDEO_MB') ?? 50);
    const maxBytes = (type === MediaType.photo ? maxImageMb : maxVideoMb) * 1024 * 1024;
    if (sizeBytes > maxBytes) {
      throw new BadRequestException(
        `Fichier trop volumineux (max ${type === MediaType.photo ? maxImageMb : maxVideoMb} Mo pour ${type === MediaType.photo ? 'une photo' : 'une vidéo'}).`,
      );
    }
  }

  private async assertQuota(listingId: string, type: MediaType) {
    const count = await this.prisma.listingMedia.count({ where: { listingId, type } });
    const max = type === MediaType.photo ? MAX_PHOTOS_PER_LISTING : MAX_VIDEOS_PER_LISTING;
    if (count >= max) {
      throw new BadRequestException(
        `Limite de ${max} ${type === MediaType.photo ? 'photos' : 'vidéos'} par annonce atteinte.`,
      );
    }
  }
}
