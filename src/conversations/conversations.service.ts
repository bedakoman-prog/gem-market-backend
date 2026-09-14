import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Messagerie basique acheteur <-> vendeur (section 5 : GET /conversations,
// POST /conversations/:id/messages). Sert notamment le bouton "Message" de
// la barre de contact multi-canal du prototype.
@Injectable()
export class ConversationsService {
  constructor(private prisma: PrismaService) {}

  async findMine(userId: string) {
    return this.prisma.conversation.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      include: { listing: true, messages: { orderBy: { sentAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async start(buyerId: string, listingId: string, body: string) {
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
    });

    const message = await this.prisma.message.create({
      data: { conversationId: conversation.id, authorId: buyerId, body },
    });

    return { conversation, message };
  }

  async postMessage(conversationId: string, authorId: string, body: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('Conversation introuvable');
    if (conversation.buyerId !== authorId && conversation.sellerId !== authorId) {
      throw new ForbiddenException("Vous ne participez pas à cette conversation");
    }

    return this.prisma.message.create({ data: { conversationId, authorId, body } });
  }

  async findMessages(conversationId: string, requesterId: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('Conversation introuvable');
    if (conversation.buyerId !== requesterId && conversation.sellerId !== requesterId) {
      throw new ForbiddenException("Vous ne participez pas à cette conversation");
    }

    return this.prisma.message.findMany({ where: { conversationId }, orderBy: { sentAt: 'asc' } });
  }
}
