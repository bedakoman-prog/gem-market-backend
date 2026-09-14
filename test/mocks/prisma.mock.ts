import { PrismaService } from '../../src/prisma/prisma.service';

const MODEL_METHODS = ['findUnique', 'findFirst', 'findMany', 'create', 'update', 'updateMany', 'count', 'delete', 'upsert'] as const;

// Mock Prisma minimal pour les tests unitaires : chaque modèle utilisé
// (order.create, listing.findUnique, etc.) expose des jest.fn() créés à la
// demande, sans avoir besoin d'une vraie base de données ni du client Prisma
// généré. Volontairement non typé strictement (Proxy) — voir les tests pour
// la forme réelle attendue de chaque appel.
export function createPrismaMock(): PrismaService {
  const cache: Record<string, Record<string, jest.Mock>> = {};

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (!cache[prop]) {
        cache[prop] = {};
        for (const method of MODEL_METHODS) {
          cache[prop][method] = jest.fn();
        }
      }
      return cache[prop];
    },
  };

  return new Proxy({}, handler) as unknown as PrismaService;
}
