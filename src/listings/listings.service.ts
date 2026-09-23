import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus, ListingType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { findProhibited } from '../common/moderation/prohibited-items';
import { PromoPeriodService } from '../common/promo/promo-period.service';
import { getSellerRatings } from '../common/ratings/seller-ratings';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { SearchListingsDto } from './dto/search-listings.dto';

const LISTING_INCLUDE = {
  seller: { select: { id: true, name: true, city: true, verified: true, phone: true, createdAt: true } },
  category: true,
  media: { orderBy: { position: 'asc' } },
} satisfies Prisma.ListingInclude;

@Injectable()
export class ListingsService {
  constructor(
    private prisma: PrismaService,
    private promoPeriod: PromoPeriodService,
  ) {}

  async findAll(filters: SearchListingsDto) {
    const where: Prisma.ListingWhereInput = { status: ListingStatus.active };

    if (filters.category) where.categoryId = filters.category;
    if (filters.type) where.type = filters.type as ListingType;
    // Sous-filtre générique (section 5) — utilisé aujourd'hui pour le secteur
    // de métier des annonces "emploi" (voir job-sectors.ts).
    if (filters.sub) where.jobSector = filters.sub;
    if (filters.q) {
      where.OR = [
        { title: { contains: filters.q, mode: 'insensitive' } },
        { description: { contains: filters.q, mode: 'insensitive' } },
      ];
    }

    const listings = await this.prisma.listing.findMany({
      where,
      include: LISTING_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    return this.attachSellerRatings(listings);
  }

  async findOne(id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id }, include: LISTING_INCLUDE });
    if (!listing) throw new NotFoundException('Annonce introuvable');
    const [withRatings] = await this.attachSellerRatings([listing]);
    return withRatings;
  }

  async findMine(sellerId: string) {
    const listings = await this.prisma.listing.findMany({ where: { sellerId }, include: LISTING_INCLUDE, orderBy: { createdAt: 'desc' } });
    return this.attachSellerRatings(listings);
  }

  // GET /sellers/:id/listings — boutique publique d'un vendeur (point 2 de la
  // feuille de route "nouvelles demandes") : uniquement les annonces actives,
  // comme pour la recherche.
  async findBySeller(sellerId: string) {
    const listings = await this.prisma.listing.findMany({
      where: { sellerId, status: ListingStatus.active },
      include: LISTING_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return this.attachSellerRatings(listings);
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
        jobSector: dto.jobSector,
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
        jobSector: dto.jobSector,
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
  // abonnement Boutique actif — section 4 et 6.4. Suspendue pendant la
  // période promotionnelle de lancement (voir PromoPeriodService) : les
  // vendeurs publient alors gratuitement et sans limite, le séquestre des
  // paiements restant lui actif dès le lancement.
  private async assertShopQuota(sellerId: string) {
    if (this.promoPeriod.isActive()) return;

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

  // Note moyenne + nombre d'avis du vendeur (section "avis clients sur le
  // vendeur" de la feuille de route), affichés sur chaque annonce — voir
  // common/ratings/seller-ratings.ts. Une seule requête groupée par lot
  // d'annonces plutôt qu'un aller-retour base par annonce.
  private async attachSellerRatings<T extends { seller?: { id: string } | null }>(items: T[]) {
    const sellerIds = items.map((i) => i.seller?.id).filter((id): id is string => !!id);
    const ratings = await getSellerRatings(this.prisma, sellerIds);
    return items.map((item) => ({
      ...item,
      seller: item.seller
        ? { ...item.seller, ...(ratings.get(item.seller.id) ?? { rating: null, ratingsCount: 0 }) }
        : item.seller,
    }));
  }
}
