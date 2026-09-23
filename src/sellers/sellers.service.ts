import { Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListingsService } from '../listings/listings.service';
import { getSellerRatings } from '../common/ratings/seller-ratings';

const SELLER_PROFILE_SELECT = {
  id: true,
  name: true,
  city: true,
  verified: true,
  isSeller: true,
  createdAt: true,
} as const;

@Injectable()
export class SellersService {
  constructor(
    private prisma: PrismaService,
    private listings: ListingsService,
  ) {}

  async findOne(id: string) {
    const seller = await this.prisma.user.findUnique({ where: { id }, select: SELLER_PROFILE_SELECT });
    if (!seller) throw new NotFoundException('Vendeur introuvable');

    const [ratings, activeListingsCount] = await Promise.all([
      getSellerRatings(this.prisma, [id]),
      this.prisma.listing.count({ where: { sellerId: id, status: ListingStatus.active } }),
    ]);

    return {
      ...seller,
      ...(ratings.get(id) ?? { rating: null, ratingsCount: 0 }),
      activeListingsCount,
    };
  }

  findListings(sellerId: string) {
    return this.listings.findBySeller(sellerId);
  }
}

