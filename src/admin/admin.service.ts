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

// POST /admin/listings/:id/reject — retire une annonce de la publication,
// qu'elle soit en attente ("draft") ou déjà en ligne ("active") : aucune
// restriction de statut de départ, contrairement à approveListing. Une fois
// au statut "rejected", l'annonce disparaît de toute recherche/boutique
// publique (ListingsService.findAll / findBySeller filtrent sur "active"),
// sans être supprimée de la base — l'historique (commandes, messages,
// signalements liés) reste intact. Motif optionnel, conservé pour traçabilité
// et affiché au vendeur/à l'admin ; voir restoreListing pour annuler.
async rejectListing(listingId: string, reason?: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Annonce introuvable');
    return this.prisma.listing.update({
          where: { id: listingId },
          data: { status: ListingStatus.rejected, rejectionReason: reason?.trim() || null },
    });
}

// POST /admin/listings/:id/restore — annule un retrait fait par erreur ou
// après résolution du problème signalé : remet l'annonce en ligne et efface
// le motif. Ne s'applique qu'aux annonces actuellement "rejected" (pas aux
// brouillons en attente, qui passent par approveListing).
async restoreListing(listingId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Annonce introuvable');
    if (listing.status !== ListingStatus.rejected) {
          throw new BadRequestException(
                  `Impossible de republier : l'annonce est au statut "${listing.status}" (attendu : rejected).`,
                );
    }
    return this.prisma.listing.update({
          where: { id: listingId },
          data: { status: ListingStatus.active, rejectionReason: null },
    });
}

// GET /admin/listings — toutes les annonces actives ou retirées, pour que
// l'administration puisse retirer n'importe quelle publication en cours "pour
// une raison ou une autre" (pas seulement celles déjà signalées). Les
// brouillons en attente de première validation restent sur leur propre écran
// (findPendingListings) pour ne pas dupliquer ce flux.
findAllListings() {
    return this.prisma.listing.findMany({
          where: { status: { in: [ListingStatus.active, ListingStatus.rejected] } },
          include: {
                  seller: { select: { id: true, name: true, shopName: true, phone: true, verified: true } },
          },
          orderBy: { createdAt: 'desc' },
    });
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

// GET /admin/sellers — liste des vendeurs (comptes avec au moins une annonce,
// ou déjà marqués isSeller) pour l'écran de vérification. Les non-vérifiés
// remontent en premier pour prioriser le travail de modération.
findSellers() {
    return this.prisma.user.findMany({
          where: { OR: [{ isSeller: true }, { listings: { some: {} } }] },
          select: {
                  id: true,
                  name: true,
                  shopName: true,
                  phone: true,
                  email: true,
                  city: true,
                  country: true,
                  verified: true,
                  createdAt: true,
                  _count: { select: { listings: true } },
          },
          orderBy: [{ verified: 'asc' }, { createdAt: 'desc' }],
    });
}

// POST /admin/sellers/:id/verify — à utiliser uniquement après qu'un
// modérateur a constaté que la boutique/l'annonce existe réellement (appel
// téléphonique, visite, pièce justificative, etc. — hors périmètre de cette
// API). Remplace l'ancien comportement où `verified` passait à true tout
// seul dès l'inscription.
async verifySeller(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return this.prisma.user.update({
          where: { id: userId },
          data: { verified: true },
          select: { id: true, name: true, shopName: true, verified: true },
    });
}

async unverifySeller(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return this.prisma.user.update({
          where: { id: userId },
          data: { verified: false },
          select: { id: true, name: true, shopName: true, verified: true },
    });
}
}
