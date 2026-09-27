import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopSubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { PromoPeriodService } from '../common/promo/promo-period.service';

// Abonnement "Boutique" — 1$/jour, jusqu'à 10 annonces actives hors "espace"
// (section 6.4 du cahier des charges). Pendant la période promotionnelle de
// lancement (voir PromoPeriodService), cette exigence est suspendue : le
// vendeur publie gratuitement sans avoir à souscrire.
//
// Au-delà des 10 annonces incluses, un vendeur avec un abonnement de base
// actif peut acheter de la capacité supplémentaire (ShopExtraSlot) à
// 0,5$/jour et par annonce (voir subscribeExtra ci-dessous) — même logique
// de promo : suspendu tant que la période de lancement gratuite est active.
@Injectable()
export class ShopSubscriptionsService {
  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
    private config: ConfigService,
    private promoPeriod: PromoPeriodService,
  ) {}

  async status(sellerId: string) {
    const sub = await this.prisma.shopSubscription.findFirst({
      where: { sellerId, status: ShopSubscriptionStatus.active, endDate: { gt: new Date() } },
      orderBy: { endDate: 'desc' },
    });

    // La capacité supplémentaire n'a de sens qu'au-dessus d'un abonnement de
    // base actif : si `sub` est absent, elle n'est pas comptée (voir
    // subscribeExtra, qui refuse de toute façon la vente sans base active).
    const extraAgg = sub
      ? await this.prisma.shopExtraSlot.aggregate({
          where: { sellerId, status: ShopSubscriptionStatus.active, endDate: { gt: new Date() } },
          _sum: { quantity: true },
        })
      : null;
    const extraListings = extraAgg?._sum?.quantity ?? 0;

    const activeListingsCount = await this.prisma.listing.count({
      where: {
        sellerId,
        status: 'active',
        type: { in: ['bien', 'service', 'emploi'] },
      },
    });

    const promoActive = this.promoPeriod.isActive();

    return {
      // "active" reste vrai uniquement pour un VRAI abonnement payé — la
      // gratuité de promo est signalée séparément via promoActive/promoEndsAt
      // pour que le frontend puisse afficher un message distinct ("période
      // de lancement gratuite" plutôt que "abonnement actif").
      active: Boolean(sub),
      endDate: sub?.endDate ?? null,
      // Limite effective = quota de base + capacité supplémentaire achetée.
      maxListings: sub ? sub.maxListings + extraListings : 0,
      baseMaxListings: sub?.maxListings ?? 0,
      extraListings,
      extraPricePerDayUsd: this.extraPricePerDay(),
      activeListingsCount,
      promoActive,
      promoEndsAt: this.promoPeriod.endsAt(),
    };
  }

  private extraPricePerDay(): number {
    return Number(this.config.get('SHOP_EXTRA_LISTING_PRICE_PER_DAY_USD') ?? 0.5);
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
      `Abonnement Boutique TROUVE TOUT — ${days} jour(s)`,
      sellerPhone,
    );

    return { subscriptionId: sub.id, ...checkout };
  }

  // POST /shop/subscribe-extra — capacité supplémentaire au-delà des 10
  // annonces incluses dans l'abonnement de base, à 0,5$/jour et par annonce
  // (décision produit : le tarif de base 1$/10 annonces reste inchangé).
  // Nécessite un abonnement de base déjà actif : on ne vend pas de capacité
  // supplémentaire seule. Comme subscribe(), l'encaissement suit le même
  // circuit (checkout simulé ou webhook réel) et le solde effectif de la
  // capacité est recalculé dans status()/assertShopQuota à partir de tous les
  // ShopExtraSlot actifs et non expirés.
  async subscribeExtra(sellerId: string, quantity: number, days: number, sellerPhone: string) {
    const activeSub = await this.prisma.shopSubscription.findFirst({
      where: { sellerId, status: ShopSubscriptionStatus.active, endDate: { gt: new Date() } },
    });
    if (!activeSub) {
      throw new BadRequestException(
        "Un abonnement Boutique de base actif (1 $/jour, 10 annonces) est requis avant d'acheter des annonces supplémentaires.",
      );
    }

    const pricePerDay = this.extraPricePerDay();
    // Même remarque que subscribe() : prix fixé en USD, encaissé en FCFA via
    // un taux indicatif à remplacer avant production.
    const amountFcfa = Math.round(pricePerDay * quantity * days * 615);

    const slot = await this.prisma.shopExtraSlot.create({
      data: {
        sellerId,
        quantity,
        startDate: new Date(),
        endDate: new Date(Date.now() + days * 24 * 3600 * 1000),
        pricePerDayUsd: pricePerDay,
        status: ShopSubscriptionStatus.expired, // activé par le webhook (ou le mode simulé) une fois payé
      },
    });

    const checkout = await this.payments.initiateCollect(
      'shop_extra',
      slot.id,
      amountFcfa,
      `Boutique TROUVE TOUT — ${quantity} annonce(s) supplémentaire(s) × ${days} jour(s)`,
      sellerPhone,
    );

    return { extraSlotId: slot.id, ...checkout };
  }
}
