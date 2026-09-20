import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus, OrderStatus, ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
  export class AdminService {
  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
    private orders: OrdersService,
    ) {}

findReports() {
  return this.prisma.report.findMany({
    where: { status: ReportStatus.open },
    include: {
      listing: true,
      reporter: { select: { id: true, name: true } },
      seller: { select: { id: true, name: true, phone: true, verified: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

async reviewReport(reportId: string, status: 'reviewed' | 'dismissed') {
  return this.prisma.report.update({ where: { id: reportId }, data: { status } });
}

async rejectListing(listingId: string) {
  const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new NotFoundException('Annonce introuvable');
  return this.prisma.listing.update({ where: { id: listingId }, data: { status: ListingStatus.rejected } });
}

findDisputedOrders() {
  return this.prisma.order.findMany({
    where: { status: OrderStatus.disputed },
    include: {
      listing: true,
      buyer: { select: { id: true, name: true, phone: true } },
      seller: { select: { id: true, name: true, phone: true, verified: true } },
    },
    orderBy: { disputedAt: 'asc' },
  });
}

                           async refundOrder(orderId: string, reason?: string) {
                             const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { buyer: true } });
                             if (!order) throw new NotFoundException('Commande introuvable');
                             if (order.status !== OrderStatus.disputed && order.status !== OrderStatus.paid_escrow) {
                               throw new BadRequestException(
                                 `Impossible de rembourser : la commande est au statut "${order.status}" (attendu : paid_escrow ou disputed).`,
                                 );
                             }

    const refund = await this.payments.refundToBuyer({
      orderId: order.id,
      buyerId: order.buyerId,
      buyerPhone: order.buyer.phone,
      amountFcfa: order.amountFcfa,
      reason: reason ?? order.disputeReason ?? undefined,
    });

  if (refund.status === 'failed') {
    throw new BadRequestException(
      "Le remboursement a échoué. La commande reste en l'état ; contactez le prestataire de paiement.",
      );
  }

  await this.prisma.order.update({
    where: { id: order.id },
    data: {
      status: OrderStatus.refunded,
      disputeReason: order.disputeReason ?? reason,
    },
  });

  return refund;
                           }

                             releaseOrder(orderId: string) {
                               return this.orders.adminReleaseEscrow(orderId);
                             }
}
