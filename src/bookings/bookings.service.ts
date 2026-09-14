import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ListingType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';

// Réservation d'un espace (hôtel, studio, bureau…) — paiement direct sans
// séquestre, plus simple que le flux Orders (section 6.3 du cahier des
// charges : "un seul appel d'encaissement, pas de reversement différé").
@Injectable()
export class BookingsService {
  constructor(private prisma: PrismaService, private payments: PaymentsService) {}

  async create(buyerId: string, dto: { listingId: string; startDate: string; endDate: string }, buyerPhone: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: dto.listingId } });
    if (!listing) throw new NotFoundException('Annonce introuvable');
    if (listing.type !== ListingType.espace) {
      throw new BadRequestException("Seules les annonces de type 'espace' peuvent être réservées.");
    }

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end <= start) throw new BadRequestException('La date de fin doit être après la date de début.');

    const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    const amountFcfa = listing.priceFcfa * nights;

    const booking = await this.prisma.booking.create({
      data: { listingId: listing.id, buyerId, startDate: start, endDate: end, amountFcfa },
    });

    const checkout = await this.payments.initiateCollect(
      'booking',
      booking.id,
      amountFcfa,
      `Réservation GEM Market — ${listing.title}`,
      buyerPhone,
    );

    return { bookingId: booking.id, amountFcfa, ...checkout };
  }

  findMine(buyerId: string) {
    return this.prisma.booking.findMany({ where: { buyerId }, include: { listing: true }, orderBy: { createdAt: 'desc' } });
  }
}
