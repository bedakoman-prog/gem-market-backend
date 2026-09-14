import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ListingsService } from './listings.service';
import { createPrismaMock } from '../../test/mocks/prisma.mock';
import { PrismaService } from '../prisma/prisma.service';

// ListingType/ListingStatus sont des enums Prisma générés (valeurs chaîne
// identiques aux littéraux ci-dessous) — on utilise directement les
// littéraux pour ne pas dépendre de `prisma generate` dans ces tests.
const BIEN = 'bien';
const ESPACE = 'espace';

describe('ListingsService', () => {
  let prisma: PrismaService;
  let service: ListingsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ListingsService(prisma);
  });

  describe('create', () => {
    it("refuse une annonce contenant un article interdit (modération serveur — section 7)", async () => {
      await expect(
        service.create('seller-1', {
          categoryId: 'medical',
          type: BIEN as any,
          title: 'Vente de comprimés antidouleur',
          description: 'lot de médicaments',
          priceFcfa: 5000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      // La modération doit s'arrêter avant toute écriture en base.
      expect((prisma as any).listing.create).not.toHaveBeenCalled();
    });

    it("refuse de publier un bien/service sans abonnement boutique actif", async () => {
      (prisma as any).shopSubscription.findFirst.mockResolvedValue(null);
      (prisma as any).listing.count.mockResolvedValue(0);

      await expect(
        service.create('seller-1', {
          categoryId: 'mode',
          type: BIEN as any,
          title: 'Robe wax',
          description: 'Robe en wax faite main',
          priceFcfa: 15000,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuse de publier au-delà de la limite d'annonces actives de la boutique", async () => {
      (prisma as any).shopSubscription.findFirst.mockResolvedValue({ maxListings: 10 });
      (prisma as any).listing.count.mockResolvedValue(10); // déjà à la limite

      await expect(
        service.create('seller-1', {
          categoryId: 'mode',
          type: BIEN as any,
          title: 'Chaussures en cuir',
          description: 'Paire de chaussures en cuir véritable',
          priceFcfa: 20000,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("n'applique pas la limite boutique aux annonces de type 'espace'", async () => {
      (prisma as any).category.findUnique.mockResolvedValue({ id: 'espace' });
      (prisma as any).listing.create.mockResolvedValue({ id: 'listing-1' });

      await service.create('seller-1', {
        categoryId: 'espace',
        type: ESPACE as any,
        title: 'Studio meublé à Cocody',
        description: 'Studio meublé, wifi, climatisation',
        priceFcfa: 15000,
      });

      // Aucune vérification de quota ne doit être faite pour un "espace"
      // (point d'attention explicite de la section 3 du cahier des charges).
      expect((prisma as any).shopSubscription.findFirst).not.toHaveBeenCalled();
      expect((prisma as any).listing.create).toHaveBeenCalled();
    });

    it('refuse une catégorie inconnue', async () => {
      (prisma as any).category.findUnique.mockResolvedValue(null);

      await expect(
        service.create('seller-1', {
          categoryId: 'inexistante',
          type: ESPACE as any,
          title: 'Annonce test',
          description: 'Description valide',
          priceFcfa: 1000,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it("refuse de modifier l'annonce d'un autre vendeur", async () => {
      (prisma as any).listing.findUnique.mockResolvedValue({
        id: 'listing-1',
        sellerId: 'seller-1',
        title: 'x',
        description: 'y',
      });

      await expect(
        service.update('seller-2', 'listing-1', { title: 'Nouveau titre' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
