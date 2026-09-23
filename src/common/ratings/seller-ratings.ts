import { PrismaService } from '../../prisma/prisma.service';

export interface SellerRatingSummary {
  rating: number | null;
  ratingsCount: number;
}

// Note moyenne + nombre d'avis par vendeur (section "avis clients sur le
// vendeur"), calcules a partir du modele Review (voir reviews.service.ts).
// Une seule requete groupee pour plusieurs vendeurs a la fois, pour eviter
// un aller-retour base par annonce sur les listes (GET /listings, etc.).
export async function getSellerRatings(
  prisma: PrismaService,
  sellerIds: string[],
): Promise<Map<string, SellerRatingSummary>> {
  const map = new Map<string, SellerRatingSummary>();
  const uniqueIds = [...new Set(sellerIds)];
  if (uniqueIds.length === 0) return map;

  const grouped = await prisma.review.groupBy({
    by: ['targetSellerId'],
    where: { targetSellerId: { in: uniqueIds } },
    _avg: { rating: true },
    _count: { _all: true },
  });

  for (const row of grouped) {
    map.set(row.targetSellerId, {
      rating: row._avg.rating,
      ratingsCount: row._count._all,
    });
  }
  return map;
}

