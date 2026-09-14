import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// POST /orders/:id/review — un avis ne peut être laissé qu'une fois la
// commande "released" (transaction réellement allée à son terme), pour
// éviter les faux avis avant même la livraison.
@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async create(orderId: string, authorId: string, rating: number, comment?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Commande introuvable');
    if (order.buyerId !== authorId) throw new ForbiddenException("Cette commande ne vous appartient pas");
    if (order.status !== OrderStatus.released) {
      throw new BadRequestException("Un avis ne peut être laissé qu'une fois la commande finalisée (released).");
    }

    return this.prisma.review.create({
      data: { orderId, authorId, targetSellerId: order.sellerId, rating, comment },
    });
  }
}
