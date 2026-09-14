import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ListingType, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';

// Achat en séquestre d'un bien ou d'un service — section 6.2 du cahier des
// charges. Le flux complet :
//   POST /orders                  -> pending, lance l'encaissement
//   (webhook confirmé)            -> paid_escrow
//   POST /orders/:id/confirm-receipt -> released + reversement vendeur
@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
    private config: ConfigService,
  ) {}

  private commissionRate(): number {
    return Number(this.config.get('PLATFORM_COMMISSION_RATE') ?? 0.01);
  }

  async create(buyerId: string, listingId: string, buyerPhone: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Annonce introuvable');
    if (listing.type !== ListingType.bien && listing.type !== ListingType.service) {
      throw new BadRequestException("Seules les annonces 'bien' ou 'service' passent par une commande en séquestre.");
    }
    if (listing.sellerId === buyerId) {
      throw new BadRequestException('Vous ne pouvez pas acheter votre propre annonce.');
    }

    const platformFeeFcfa = Math.round(listing.priceFcfa * this.commissionRate());

    const order = await this.prisma.order.create({
      data: {
        listingId: listing.id,
        buyerId,
        sellerId: listing.sellerId,
        amountFcfa: listing.priceFcfa,
        platformFeeFcfa,
        status: OrderStatus.pending,
      },
    });

    const checkout = await this.payments.initiateCollect(
      'order',
      order.id,
      order.amountFcfa,
      `Achat GEM Market — ${listing.title}`,
      buyerPhone,
    );

    return { orderId: order.id, ...checkout };
  }

  async findMyPurchases(buyerId: string) {
    return this.prisma.order.findMany({ where: { buyerId }, include: { listing: true }, orderBy: { createdAt: 'desc' } });
  }

  async findMySales(sellerId: string) {
    return this.prisma.order.findMany({ where: { sellerId }, include: { listing: true }, orderBy: { createdAt: 'desc' } });
  }

  // POST /orders/:id/confirm-receipt — l'acheteur confirme avoir reçu le
  // bien/service : ceci libère le séquestre et déclenche le reversement net
  // (montant - commission 1%) vers le vendeur (section 6.2).
  async confirmReceipt(orderId: string, buyerId: string, sellerPhone: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Commande introuvable');
    if (order.buyerId !== buyerId) throw new ForbiddenException("Cette commande ne vous appartient pas");
    if (order.status !== OrderStatus.paid_escrow) {
      throw new BadRequestException(
        `Impossible de confirmer : la commande est au statut "${order.status}" (attendu : paid_escrow).`,
      );
    }

    const netAmount = order.amountFcfa - order.platformFeeFcfa;

    const payout = await this.payments.payoutToSeller({
      orderId: order.id,
      sellerId: order.sellerId,
      sellerPhone,
      amountFcfa: netAmount,
    });

    // Important (section 6.2) : on ne passe en "released" que si le
    // reversement a bien été envoyé — sinon la commande reste en
    // paid_escrow avec un Payout en échec, à traiter manuellement/en file
    // de reprise plutôt que de perdre la trace du paiement.
    if (payout.status === 'failed') {
      throw new BadRequestException(
        "Le reversement au vendeur a échoué. La commande reste en séquestre ; contactez le support.",
      );
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.released, releasedAt: new Date() },
    });
  }
}
