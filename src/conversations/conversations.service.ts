import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeMessageBody } from './contact-filter';

// Messagerie basique acheteur <-> vendeur (section 5 : GET /conversations,
// POST /conversations/:id/messages). Sert notamment le bouton "Message" de
// la barre de contact multi-canal du prototype.
//
// NB : buyer/seller/author sont explicitement inclus (select restreint, sans
// téléphone/email) car le frontend affiche le nom de l'interlocuteur dans la
// liste des conversations et dans le fil de discussion.
//
// Chaque message posté passe par sanitizeMessageBody() : les coordonnées de
// contact externes (téléphone, email, réseaux sociaux) sont masquées avant
// d'être enregistrées, pour que la conversation reste exploitable par GEM
// Market en cas de litige.
const PARTY_SELECT = { id: true, name: true, shopName: true, city: true, verified: true } as const;

@Injectable()
export class ConversationsService {
  constructor(private prisma: PrismaService) {}

  async findMine(userId: string) {
    return this.prisma.conversation.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      include: {
        listing: true,
        buyer: { select: PARTY_SELECT },
        seller: { select: PARTY_SELECT },
        messages: { orderBy: { sentAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async start(buyerId: string, listingId: string, rawBody: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Annonce introuvable');
    if (listing.sellerId === buyerId) {
      throw new BadRequestException('Vous ne pouvez pas démarrer une conversation avec vous-même.');
    }

    const conversation = await this.prisma.conversation.upsert({
      where: {
        listingId_buyerId_sellerId: { listingId, buyerId, sellerId: listing.sellerId },
      },
      update: {},
      create: { listingId, buyerId, sellerId: listing.sellerId },
      include: { listing: true, buyer: { select: PARTY_SELECT }, seller: { select: PARTY_SELECT } },
    });

    const { body, flagged } = sanitizeMessageBody(rawBody);
    const message = await this.prisma.message.create({
      data: { conversationId: conversation.id, authorId: buyerId, body, flagged },
    });

    return { conversation, message };
  }

  async postMessage(conversationId: string, authorId: string, rawBody: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('Conversation introuvable');
    if (conversation.buyerId !== authorId && conversation.sellerId !== authorId) {
      throw new ForbiddenException("Vous ne participez pas à cette conversation");
    }

    const { body, flagged } = sanitizeMessageBody(rawBody);
    return this.prisma.message.create({ data: { conversationId, authorId, body, flagged } });
  }

  async findMessages(conversationId: string, requesterId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { listing: true, buyer: { select: PARTY_SELECT }, seller: { select: PARTY_SELECT } },
    });
    if (!conversation) throw new NotFoundException('Conversation introuvable');
    if (conversation.buyerId !== requesterId && conversation.sellerId !== requesterId) {
      throw new ForbiddenException("Vous ne participez pas à cette conversation");
    }

    const messages = await this.prisma.message.findMany({ where: { conversationId }, orderBy: { sentAt: 'asc' } });
    return { conversation, messages };
  }
}
