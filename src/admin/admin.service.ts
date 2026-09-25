import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus, OrderStatus, ReportStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { OrdersService } from '../orders/orders.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
  export class AdminService {
    constructor(
          private prisma: PrismaService,
          private payments: PaymentsService,
          private orders: OrdersService,
          private auth: AuthService,
        ) {}

findReports() {
    return this.prisma.report.findMany({
          where: { status: ReportStatus.open },
          include: {
                  listing: true,
                  reporter: { select: { id: true, name: true } },
                  seller: { select: { id: true, name: true, shopName: true, phone: true, verified: true } },
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

// GET /admin/listings/pending - file de pre-moderation (voir ListingsService.create,
// statut "draft" par defaut depuis la decision "pas de paiement pendant les 3 mois
// de lancement, mais publication soumise a approbation"). Sert de garde-fou contre
// les annonces abusives tant que le quota boutique payant est suspendu.
findPendingListings() {
    return this.prisma.listing.findMany({
          where: { status: ListingStatus.draft },
          include: {
                  seller: { select: { id: true, name: true, phone: true, verified: true } },
                  category: true,
                  media: { orderBy: { position: 'asc' } },
          },
          orderBy: { createdAt: 'asc' },
    });
}

// POST /admin/listings/:id/approve - fait passer une annonce en attente
// ("draft") en "active" : elle devient alors visible dans la recherche
// publique et sur la boutique du vendeur (voir ListingsService.findAll /
// findBySeller, qui filtrent deja sur "active").
async approveListing(listingId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Annonce introuvable');
    if (listing.status !== ListingStatus.draft) {
          throw new BadRequestException(
                  `Impossible d'approuver : l'annonce est au statut "${listing.status}" (attendu : draft).`,
                );
    }
    return this.prisma.listing.update({ where: { id: listingId }, data: { status: ListingStatus.active } });
}

findDisputedOrders() {
    return this.prisma.order.findMany({
          where: { status: OrderStatus.disputed },
          include: {
                  listing: true,
                  buyer: { select: { id: true, name: true, phone: true } },
                  seller: { select: { id: true, name: true, shopName: true, phone: true, verified: true } },
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

// PATCH /admin/users/:id/role — seul point d'écriture des rôles désormais
// (la route bootstrap-admin a été retirée pour raisons de sécurité). Met à
// jour isAdmin en même temps que role : admin -> isAdmin=true, sinon false,
// ce qui permet aussi de rétrograder proprement un compte isAdmin historique.
async setUserRole(userId: string, role: Role) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return this.prisma.user.update({
          where: { id: userId },
          data: { role, isAdmin: role === Role.admin },
          select: { id: true, name: true, phone: true, role: true, isAdmin: true },
    });
}

// POST /admin/users/:id/suspend — bloque la connexion (OTP, mot de passe,
// refresh) et coupe l'accès immédiatement sur les sessions déjà ouvertes
// (voir JwtStrategy). Réservé aux comptes "user" : un moderator/admin doit
// d'abord être rétrogradé via PATCH /admin/users/:id/role (setUserRole)
// avant de pouvoir être suspendu — évite qu'un moderator fasse taire un
// admin (ou un autre moderator) via cette route.
async suspendUser(userId: string, reason?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const effectiveRole = user.isAdmin ? Role.admin : user.role;
    if (effectiveRole !== Role.user) {
          throw new BadRequestException(
                  'Impossible de suspendre un compte moderator/admin : rétrogradez-le d\'abord via la gestion des rôles.',
                );
    }

    const updated = await this.prisma.user.update({
          where: { id: userId },
          data: { suspended: true, suspendedReason: reason ?? null, suspendedAt: new Date() },
          select: { id: true, name: true, phone: true, suspended: true, suspendedReason: true, suspendedAt: true },
    });
    await this.auth.revokeAllForUser(userId);
    return updated;
}

// POST /admin/users/:id/unsuspend — lève la suspension, aucune session à
// révoquer (l'accès était déjà coupé).
async unsuspendUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return this.prisma.user.update({
          where: { id: userId },
          data: { suspended: false, suspendedReason: null, suspendedAt: null },
          select: { id: true, name: true, phone: true, suspended: true },
    });
}
}
