import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopSubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';

// Abonnement "Boutique" — 1$/jour, jusqu'à 10 annonces actives hors "espace"
// (section 6.4 du cahier des charges).
@Injectable()
export class ShopSubscriptionsService {
  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
    private config: ConfigService,
  ) {}

  async status(sellerId: string) {
    const sub = await this.prisma.shopSubscription.findFirst({
      where: { sellerId, status: ShopSubscriptionStatus.active, endDate: { gt: new Date() } },
      orderBy: { endDate: 'desc' },
    });

    const activeListingsCount = await this.prisma.listing.count({
      where: {
        sellerId,
        status: 'active',
        type: { in: ['bien', 'service', 'emploi'] },
      },
    });

    return {
      active: Boolean(sub),
      endDate: sub?.endDate ?? null,
      maxListings: sub?.maxListings ?? 0,
      activeListingsCount,
    };
  }

  // POST /shop/subscribe — encaissement classique à chaque renouvellement,
  // sans séquestre (section 6.4). L'abonnement est activé seulement après
  // confirmation du webhook (voir PaymentsService.applyVerifiedCollect).
  async subscribe(sellerId: string, days: number, sellerPhone: string) {
    const pricePerDay = Number(this.config.get('SHOP_PRICE_PER_DAY_USD') ?? 1);
    const maxListings = Number(this.config.get('SHOP_MAX_LISTINGS') ?? 10);
    // NB : le prix est fixé en USD dans le prototype, mais l'encaissement se
    // fait en FCFA — à brancher sur un taux de change réel avant production.
    const amountFcfa = pricePerDay * days * 615; // taux indicatif, à remplacer

    const sub = await this.prisma.shopSubscription.create({
      data: {
        sellerId,
        startDate: new Date(),
        endDate: new Date(Date.now() + days * 24 * 3600 * 1000),
        pricePerDayUsd: pricePerDay,
        maxListings,
        status: ShopSubscriptionStatus.expired, // activé par le webhook une fois payé
      },
    });

    const checkout = await this.payments.initiateCollect(
      'shop',
      sub.id,
      amountFcfa,
      `Abonnement Boutique GEM Market — ${days} jour(s)`,
      sellerPhone,
    );

    return { subscriptionId: sub.id, ...checkout };
  }
}
