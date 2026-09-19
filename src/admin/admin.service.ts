import { Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus, ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  findReports() {
    return this.prisma.report.findMany({
      where: { status: ReportStatus.open },
      include: {
        listing: true,
        reporter: { select: { id: true, name: true } },
        // Un signalement peut viser un vendeur sans annonce précise (sellerId
        // seul, cf. CreateReportDto) — sans ce include, ces signalements
        // arrivaient à la modération sans aucun nom ni info exploitable.
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
    // Journalisation minimale (section 7 : "journaliser les annonces rejetées") :
    // dans une vraie version, écrire dans une table d'audit dédiée plutôt que
    // seulement changer le statut.
    return this.prisma.listing.update({ where: { id: listingId }, data: { status: ListingStatus.rejected } });
  }
}
