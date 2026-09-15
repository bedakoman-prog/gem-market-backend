import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus, ListingType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { findProhibited } from '../common/moderation/prohibited-items';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { SearchListingsDto } from './dto/search-listings.dto';

const LISTING_INCLUDE = {
  seller: { select: { id: true, name: true, city: true, verified: true, phone: true } },
  category: true,
  media: { orderBy: { position: 'asc' } },
} satisfies Prisma.ListingInclude;

@Injectable()
export class ListingsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: SearchListingsDto) {
    const where: Prisma.ListingWhereInput = { status: ListingStatus.active };

    if (filters.category) where.categoryId = filters.category;
    if (filters.type) where.type = filters.type as ListingType;
    if (filters.q) {
      where.OR = [
        { title: { contains: filters.q, mode: 'insensitive' } },
        { description: { contains: filters.q, mode: 'insensitive' } },
      ];
    }

    return this.prisma.listing.findMany({
      where,
      include: LISTING_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
  }

  async findOne(id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id }, include: LISTING_INCLUDE });
    if (!listing) throw new NotFoundException('Annonce introuvable');
    return listing;
  }

  // POST /listings — la modération et la règle "boutique" (section 4, 6.4,
  // et point d'attention section 3 : les annonces "espace" ne comptent pas
  // dans la limite de 10) sont revalidées ici, jamais côté client seul.
  async create(sellerId: string, dto: CreateListingDto) {
    const flaggedReason = findProhibited(`${dto.title} ${dto.description}`);
    if (flaggedReason) {
      throw new BadRequestException(
        `Cette annonce ne peut pas être publiée : catégorie interdite détectée (${flaggedReason}).`,
      );
    }

    if (dto.type !== ListingType.espace) {
      await this.assertShopQuota(sellerId);
    }

    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new BadRequestException('Catégorie inconnue');

    return this.prisma.listing.create({
      data: {
        sellerId,
        categoryId: dto.categoryId,
        type: dto.type,
        jobKind: dto.jobKind,
        title: dto.title,
        description: dto.description,
        priceFcfa: dto.priceFcfa,
        specs: dto.specs as unknown as Prisma.InputJsonValue,
        status: ListingStatus.active, // MVP : pas de file de pré-modération manuelle avant mise en ligne
      },
      include: LISTING_INCLUDE,
    });
  }

  async update(sellerId: string, id: string, dto: UpdateListingDto) {
    const listing = await this.findOne(id);
    if (listing.sellerId !== sellerId) throw new ForbiddenException("Cette annonce ne vous appartient pas");

    if (dto.title || dto.description) {
      const flaggedReason = findProhibited(`${dto.title ?? listing.title} ${dto.description ?? listing.description}`);
      if (flaggedReason) {
        throw new BadRequestException(
          `Modification refusée : catégorie interdite détectée (${flaggedReason}).`,
        );
      }
    }

    return this.prisma.listing.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        type: dto.type,
        jobKind: dto.jobKind,
        title: dto.title,
        description: dto.description,
        priceFcfa: dto.priceFcfa,
        specs: dto.specs as unknown as Prisma.InputJsonValue,
      },
      include: LISTING_INCLUDE,
    });
  }

  async remove(sellerId: string, id: string) {
    const listing = await this.findOne(id);
    if (listing.sellerId !== sellerId) throw new ForbiddenException("Cette annonce ne vous appartient pas");
    await this.prisma.listing.update({ where: { id }, data: { status: ListingStatus.closed } });
    return { closed: true };
  }

  // Limite de 10 annonces actives (hors "espace") pour un vendeur sans
  // abonnement Boutique actif — section 4 et 6.4.
  private async assertShopQuota(sellerId: string) {
    const activeSub = await this.prisma.shopSubscription.findFirst({
      where: { sellerId, status: 'active', endDate: { gt: new Date() } },
    });

    const activeCount = await this.prisma.listing.count({
      where: {
        sellerId,
        status: ListingStatus.active,
        type: { in: [ListingType.bien, ListingType.service, ListingType.emploi] },
      },
    });

    const maxListings = activeSub?.maxListings ?? 0;
    if (!activeSub || activeCount >= maxListings) {
      throw new ForbiddenException(
        activeSub
          ? `Limite de ${maxListings} annonces actives atteinte pour votre boutique.`
          : "Un abonnement Boutique actif est requis pour publier des annonces bien/service/emploi (voir POST /shop/subscribe).",
      );
    }
  }
}
