// Données de démarrage cohérentes avec le prototype gem-market.html
// (mêmes catégories, même utilisateur "ME" et mêmes vendeurs déjà connus
// de la démo), pour pouvoir brancher l'API réelle sur des données familières.

import { PrismaClient, ListingType, ListingStatus, ShopSubscriptionStatus } from '@prisma/client';

const prisma = new PrismaClient();

const CATS = [
  { id: 'espace', label: 'Espaces à louer' },
  { id: 'hotel', label: 'Hôtels & appart. meublés' },
  { id: 'emploi', label: 'Emploi' },
  { id: 'medical', label: 'Matériel médical' },
  { id: 'electro', label: 'Électronique & Tél.' },
  { id: 'mode', label: 'Mode & Beauté' },
  { id: 'maison', label: 'Maison & Bureau' },
  { id: 'vehicule', label: 'Véhicules' },
  { id: 'alim', label: 'Vivres & Alim.' },
  { id: 'services', label: 'Services' },
  { id: 'bebe', label: 'Bébé & Enfant' },
  { id: 'sport', label: 'Sport & Loisirs' },
  { id: 'bricolage', label: 'Bricolage & Jardin' },
  { id: 'animalerie', label: 'Animalerie' },
  { id: 'divers', label: 'Divers' },
];

async function main() {
  console.log('Seed — catégories…');
  for (const c of CATS) {
    await prisma.category.upsert({
      where: { id: c.id },
      update: { label: c.label },
      create: { id: c.id, label: c.label },
    });
  }

  console.log('Seed — utilisateurs…');
  const awa = await prisma.user.upsert({
    where: { phone: '+225 07 58 12 34 56' },
    update: {},
    create: {
      phone: '+225 07 58 12 34 56',
      email: 'awa.kone@example.com',
      name: 'Awa Koné',
      city: 'Cocody, Abidjan',
      verified: true,
      isSeller: true,
    },
  });

  const clinique = await prisma.user.upsert({
    where: { phone: '+225 07 12 34 56 78' },
    update: {},
    create: {
      phone: '+225 07 12 34 56 78',
      name: 'Clinique Santé Plus',
      city: 'Cocody',
      verified: true,
      isSeller: true,
    },
  });

  const aicha = await prisma.user.upsert({
    where: { phone: '+225 07 34 56 78 90' },
    update: {},
    create: {
      phone: '+225 07 34 56 78 90',
      name: 'Atelier Aïcha',
      city: 'Treichville',
      verified: true,
      isSeller: true,
    },
  });

  console.log('Seed — abonnement boutique (Clinique Santé Plus, vendeur Pro)…');
  await prisma.shopSubscription.upsert({
    where: { id: 'seed-shop-clinique' },
    update: {},
    create: {
      id: 'seed-shop-clinique',
      sellerId: clinique.id,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      pricePerDayUsd: 1,
      maxListings: 10,
      status: ShopSubscriptionStatus.active,
    },
  });

  console.log('Seed — annonces d’exemple…');
  await prisma.listing.upsert({
    where: { id: 'seed-listing-1' },
    update: {},
    create: {
      id: 'seed-listing-1',
      sellerId: clinique.id,
      categoryId: 'medical',
      type: ListingType.bien,
      title: 'Concentrateur d’oxygène 5L — état neuf',
      description: 'Concentrateur d’oxygène portable, garantie 1 an, livraison à Abidjan.',
      priceFcfa: 285000,
      status: ListingStatus.active,
    },
  });

  await prisma.listing.upsert({
    where: { id: 'seed-listing-2' },
    update: {},
    create: {
      id: 'seed-listing-2',
      sellerId: aicha.id,
      categoryId: 'mode',
      type: ListingType.bien,
      title: 'Robe wax sur-mesure',
      description: 'Robe en tissu wax, confection sur-mesure, plusieurs coloris disponibles.',
      priceFcfa: 25000,
      status: ListingStatus.active,
    },
  });

  await prisma.listing.upsert({
    where: { id: 'seed-listing-3' },
    update: {},
    create: {
      id: 'seed-listing-3',
      sellerId: awa.id,
      categoryId: 'espace',
      type: ListingType.espace,
      title: 'Studio meublé à Cocody',
      description: 'Studio meublé, wifi, climatisation, idéal pour séjour court.',
      priceFcfa: 15000,
      status: ListingStatus.active,
      specs: [
        { icon: 'ic-ruler', label: '25 m²' },
        { icon: 'ic-bed', label: '1 chambre' },
      ],
    },
  });

  console.log('Seed terminé.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
