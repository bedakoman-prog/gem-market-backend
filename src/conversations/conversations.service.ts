import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeMessageBody } from './contact-filter';
import { PushService } from '../notifications/push.service';

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

type Party = { id: string; name: string; shopName: string | null };

interface ConversationForNotify {
  id: string;
  buyerId: string;
  sellerId: string;
  buyer: Party;
  seller: Party;
  listing?: { title: string } | null;
}

@Injectable()
export class ConversationsService {
  constructor(
    private prisma: PrismaService,
    private pushService: PushService,
  ) {}

  async findMine(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      include: {
        listing: true,
        buyer: { select: PARTY_SELECT },
        seller: { select: PARTY_SELECT },
        messages: { orderBy: { sentAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Retrié explicitement par date du dernier message (et non de création
    // de la conversation) : la discussion où l'on vient de recevoir un
    // message doit remonter en tête, même si la conversation elle-même est
    // ancienne — plus utile pour retrouver ce qu'il reste à lire.
    return conversations
      .map((c) => ({ ...c, myLastReadAt: c.buyerId === userId ? c.buyerLastReadAt : c.sellerLastReadAt }))
      .sort((a, b) => {
        const aDate = a.messages[0]?.sentAt ?? a.createdAt;
        const bDate = b.messages[0]?.sentAt ?? b.createdAt;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
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

    await this.notifyOtherParty(conversation, buyerId, body).catch(() => {});

    return { conversation, message };
  }

  async postMessage(conversationId: string, authorId: string, rawBody: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { listing: true, buyer: { select: PARTY_SELECT }, seller: { select: PARTY_SELECT } },
    });
    if (!conversation) throw new NotFoundException('Conversation introuvable');
    if (conversation.buyerId !== authorId && conversation.sellerId !== authorId) {
      throw new ForbiddenException("Vous ne participez pas à cette conversation");
    }

    const { body, flagged } = sanitizeMessageBody(rawBody);
    const message = await this.prisma.message.create({ data: { conversationId, authorId, body, flagged } });

    await this.notifyOtherParty(conversation, authorId, body).catch(() => {});

    return message;
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

  // Marque le fil comme lu par requesterId (voir bouton/effet "j'ouvre la
  // conversation" côté frontend) — sert au calcul du badge de messages non
  // lus (unreadCount ci-dessous).
  async markRead(conversationId: string, requesterId: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('Conversation introuvable');
    if (conversation.buyerId !== requesterId && conversation.sellerId !== requesterId) {
      throw new ForbiddenException("Vous ne participez pas à cette conversation");
    }

    const now = new Date();
    const data = conversation.buyerId === requesterId ? { buyerLastReadAt: now } : { sellerLastReadAt: now };
    await this.prisma.conversation.update({ where: { id: conversationId }, data });
    return { ok: true };
  }

  // Nombre de conversations avec au moins un message non lu — utilisé pour
  // le badge de l'onglet "Messages" (section 5 : notifications de
  // messagerie). Volontairement compté par conversation plutôt que par
  // message : plus lisible pour l'utilisateur ("2 conversations à lire").
  async unreadCount(userId: string): Promise<{ count: number }> {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      select: {
        buyerId: true,
        sellerId: true,
        buyerLastReadAt: true,
        sellerLastReadAt: true,
        messages: { orderBy: { sentAt: 'desc' }, take: 1, select: { authorId: true, sentAt: true } },
      },
    });

    let count = 0;
    for (const c of conversations) {
      const last = c.messages[0];
      if (!last || last.authorId === userId) continue;
      const lastReadAt = c.buyerId === userId ? c.buyerLastReadAt : c.sellerLastReadAt;
      if (!lastReadAt || last.sentAt > lastReadAt) count++;
    }
    return { count };
  }

  // Envoie une notification push à l'autre partie de la conversation (jamais
  // à l'auteur du message). N'importe quelle erreur (push non configuré,
  // service de push indisponible...) est avalée par l'appelant : un échec de
  // notification ne doit jamais faire échouer l'envoi du message lui-même.
  private async notifyOtherParty(conversation: ConversationForNotify, senderId: string, body: string) {
    const recipientId = conversation.buyerId === senderId ? conversation.sellerId : conversation.buyerId;
    const sender = conversation.buyerId === senderId ? conversation.buyer : conversation.seller;
    const senderName = sender.shopName || sender.name;
    const preview = body.length > 120 ? `${body.slice(0, 117)}…` : body;

    await this.pushService.sendToUser(recipientId, {
      title: senderName,
      body: preview,
      url: `/messages/${conversation.id}`,
    });
  }
}
