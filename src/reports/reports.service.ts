import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// POST /reports — file de signalement alimentant la modération humaine
// (section 7 : "prévoir une file de modération humaine pour les annonces
// ambiguës ou signalées").
@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  create(reporterId: string, dto: { listingId?: string; sellerId?: string; reason: string }) {
    return this.prisma.report.create({
      data: { reporterId, listingId: dto.listingId, sellerId: dto.sellerId, reason: dto.reason },
    });
  }
}
