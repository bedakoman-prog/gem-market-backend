import { ShopSubscriptionsService } from './shop-subscriptions.service';
import { PaymentsService } from '../payments/payments.service';
import { createPrismaMock } from '../../test/mocks/prisma.mock';
import { createConfigMock } from '../../test/mocks/config.mock';
import { PrismaService } from '../prisma/prisma.service';

describe('ShopSubscriptionsService', () => {
  let prisma: PrismaService;
  let payments: jest.Mocked<Pick<PaymentsService, 'initiateCollect'>>;
  let service: ShopSubscriptionsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    payments = { initiateCollect: jest.fn().mockResolvedValue({ provider: 'cinetpay', paymentUrl: 'https://pay.example', reference: 'shop_sub-1' }) };
    const config = createConfigMock({ SHOP_PRICE_PER_DAY_USD: '1', SHOP_MAX_LISTINGS: '10' });
    service = new ShopSubscriptionsService(prisma, payments as unknown as PaymentsService, config);
  });

  it("indique boutique inactive quand aucun abonnement n'est en cours", async () => {
    (prisma as any).shopSubscription.findFirst.mockResolvedValue(null);
    (prisma as any).listing.count.mockResolvedValue(0);

    const status = await service.status('seller-1');

    expect(status.active).toBe(false);
    expect(status.maxListings).toBe(0);
  });

  it('crée un abonnement en attente de paiement (status "expired" jusqu’au webhook) et lance un encaissement', async () => {
    (prisma as any).shopSubscription.create.mockResolvedValue({ id: 'sub-1' });

    await service.subscribe('seller-1', 30, '+225 07 00 00 00 00');

    expect((prisma as any).shopSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sellerId: 'seller-1', status: 'expired', maxListings: 10 }) }),
    );
    expect(payments.initiateCollect).toHaveBeenCalledWith('shop', 'sub-1', expect.any(Number), expect.any(String), '+225 07 00 00 00 00');
  });
});
