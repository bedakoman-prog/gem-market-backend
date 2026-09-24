import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ListingType, Order, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';

// Achat en séquestre d'un bien ou d'un service — section 6.2 du cahier des
// charges. Le flux complet :
//   POST /orders                  -> pending, lance l'encaissement
//   (webhook confirmé)            -> paid_escrow
//   POST /orders/:id/confirm-receipt -> released + reversement vendeur (l'acheteur confirme)
//   OrdersEscrowScheduler         -> released + reversement vendeur (72h dépassées sans confirmation)
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
      `Achat TROUVE TOUT — ${listing.title}`,
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

    const released = await this.releaseEscrow(order, sellerPhone);
    if (!released) {
      throw new BadRequestException(
        "Le reversement au vendeur a échoué. La commande reste en séquestre ; contactez le support.",
      );
    }
    return released;
  }

  // Libère le séquestre d'une commande : reversement net (montant - commission)
  // vers le vendeur, puis passage en "released". Renvoie null si le reversement
  // échoue — la commande reste en paid_escrow avec un Payout en échec, à
  // traiter manuellement plutôt que de perdre la trace du paiement (section
  // 6.2). Factorisé pour être appelé à la fois par confirmReceipt (l'acheteur
  // confirme) et par releaseExpiredEscrows (libération automatique).
  private async releaseEscrow(order: Order, sellerPhone: string): Promise<Order | null> {
    const netAmount = order.amountFcfa - order.platformFeeFcfa;

    const payout = await this.payments.payoutToSeller({
      orderId: order.id,
      sellerId: order.sellerId,
      sellerPhone,
      amountFcfa: netAmount,
    });

    if (payout.status === 'failed') return null;

    return this.prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.released, releasedAt: new Date() },
    });
  }

    // POST /orders/:id/dispute — l'acheteur signale un problème (bien non
    // conforme, service non rendu…) pendant que le séquestre est encore
    // détenu. Fait sortir la commande du champ du scheduler automatique
    // (releaseExpiredEscrows ne cible que paid_escrow) et la fait apparaître
    // dans GET /admin/disputes pour arbitrage par la modération.
    async openDispute(orderId: string, buyerId: string, reason: string) {
          const order = await this.prisma.order.findUnique({ where: { id: orderId } });
          if (!order) throw new NotFoundException('Commande introuvable');
          if (order.buyerId !== buyerId) throw new ForbiddenException('Cette commande ne vous appartient pas');
          if (order.status !== OrderStatus.paid_escrow) {
                  throw new BadRequestException(
                            `Impossible d'ouvrir un litige : la commande est au statut "${order.status}" (attendu : paid_escrow).`,
                          );
          }

          return this.prisma.order.update({
                  where: { id: orderId },
                  data: { status: OrderStatus.disputed, disputeReason: reason, disputedAt: new Date() },
          });
    }

    // POST /admin/orders/:id/release — la modération tranche un litige en
    // faveur du vendeur (ou force la libération d'une commande bloquée) :
    // même logique de reversement que confirmReceipt, sans passer par
    // l'acheteur. Accepte aussi bien paid_escrow (libération forcée) que
    // disputed (résolution de litige).
    async adminReleaseEscrow(orderId: string) {
          const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { seller: true } });
          if (!order) throw new NotFoundException('Commande introuvable');
          if (order.status !== OrderStatus.paid_escrow && order.status !== OrderStatus.disputed) {
                  throw new BadRequestException(
                            `Impossible de libérer : la commande est au statut "${order.status}" (attendu : paid_escrow ou disputed).`,
                          );
          }

          const released = await this.releaseEscrow(order, order.seller.phone);
          if (!released) {
                  throw new BadRequestException(
                            'Le reversement au vendeur a échoué. La commande reste en séquestre ; réessayez ou traitez le Payout manuellement.',
                          );
          }
          return released;
    }
  

  // Libération automatique du séquestre : pour les commandes que l'acheteur
  // n'a jamais confirmées, une fois le délai autoReleaseAt (72h par défaut,
  // ORDER_AUTO_RELEASE_HOURS) dépassé. Comble le manque identifié dans le
  // cadre de travail de l'administration ("prochaines évolutions techniques",
  // priorité n°1) — jusqu'ici rien ne libérait ces commandes. Appelé par
  // OrdersEscrowScheduler ; les échecs de reversement sont comptés, pas
  // levés, pour ne pas interrompre le traitement des autres commandes dues.
  async releaseExpiredEscrows(): Promise<{ released: number; failed: number }> {
    const dueOrders = await this.prisma.order.findMany({
      where: { status: OrderStatus.paid_escrow, autoReleaseAt: { lte: new Date() } },
      include: { seller: true },
    });

    let released = 0;
    let failed = 0;

    for (const order of dueOrders) {
      const result = await this.releaseEscrow(order, order.seller.phone);
      if (result) released += 1;
      else failed += 1;
    }

    return { released, failed };
  }
}
