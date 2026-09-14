import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PaymentsService } from '../payments/payments.service';
import { createPrismaMock } from '../../test/mocks/prisma.mock';
import { createConfigMock } from '../../test/mocks/config.mock';
import { PrismaService } from '../prisma/prisma.service';

// Tests du flux de séquestre (section 6.2 du cahier des charges) : c'est la
// partie la plus sensible du backend (argent des utilisateurs), donc celle
// qui mérite le plus de couverture avant de la faire tourner en vrai.
describe('OrdersService', () => {
  let prisma: PrismaService;
  let payments: jest.Mocked<Pick<PaymentsService, 'initiateCollect' | 'payoutToSeller'>>;
  let service: OrdersService;

  beforeEach(() => {
    prisma = createPrismaMock();
    payments = {
      initiateCollect: jest.fn().mockResolvedValue({ provider: 'cinetpay', paymentUrl: 'https://pay.example', reference: 'order_1' }),
      payoutToSeller: jest.fn(),
    };
    const config = createConfigMock({ PLATFORM_COMMISSION_RATE: '0.01' });
    service = new OrdersService(prisma, payments as unknown as PaymentsService, config);
  });

  describe('create', () => {
    it("refuse d'acheter une annonce de type 'espace' ou 'emploi' via le séquestre", async () => {
      (prisma as any).listing.findUnique.mockResolvedValue({
        id: 'listing-1',
        type: 'espace',
        sellerId: 'seller-1',
        priceFcfa: 15000,
      });

      await expect(service.create('buyer-1', 'listing-1', '+225 00 00 00 00 00')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("refuse d'acheter sa propre annonce", async () => {
      (prisma as any).listing.findUnique.mockResolvedValue({
        id: 'listing-1',
        type: 'bien',
        sellerId: 'seller-1',
        priceFcfa: 15000,
      });

      await expect(service.create('seller-1', 'listing-1', '+225 00 00 00 00 00')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('calcule la commission à 1% et lance un encaissement "order"', async () => {
      (prisma as any).listing.findUnique.mockResolvedValue({
        id: 'listing-1',
        type: 'bien',
        sellerId: 'seller-1',
        priceFcfa: 100000,
        title: 'Concentrateur d’oxygène',
      });
      (prisma as any).order.create.mockResolvedValue({ id: 'order-1', amountFcfa: 100000 });

      await service.create('buyer-1', 'listing-1', '+225 07 00 00 00 00');

      expect((prisma as any).order.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ platformFeeFcfa: 1000, amountFcfa: 100000 }) }),
      );
      expect(payments.initiateCollect).toHaveBeenCalledWith('order', 'order-1', 100000, expect.any(String), '+225 07 00 00 00 00');
    });

    it('lève une NotFoundException si l’annonce n’existe pas', async () => {
      (prisma as any).listing.findUnique.mockResolvedValue(null);
      await expect(service.create('buyer-1', 'listing-x', '+225 00 00 00 00 00')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('confirmReceipt', () => {
    it('refuse si la commande n’appartient pas à cet acheteur', async () => {
      (prisma as any).order.findUnique.mockResolvedValue({ id: 'order-1', buyerId: 'buyer-1', status: 'paid_escrow' });

      await expect(service.confirmReceipt('order-1', 'buyer-2', '+225 00 00 00 00 00')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("refuse si la commande n'est pas au statut paid_escrow", async () => {
      (prisma as any).order.findUnique.mockResolvedValue({ id: 'order-1', buyerId: 'buyer-1', status: 'pending' });

      await expect(service.confirmReceipt('order-1', 'buyer-1', '+225 00 00 00 00 00')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('libère le séquestre (released) quand le reversement réussit', async () => {
      (prisma as any).order.findUnique.mockResolvedValue({
        id: 'order-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        status: 'paid_escrow',
        amountFcfa: 100000,
        platformFeeFcfa: 1000,
      });
      payments.payoutToSeller.mockResolvedValue({ status: 'sent' } as any);
      (prisma as any).order.update.mockResolvedValue({ id: 'order-1', status: 'released' });

      await service.confirmReceipt('order-1', 'buyer-1', '+225 00 00 00 00 00');

      expect(payments.payoutToSeller).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'order-1', sellerId: 'seller-1', amountFcfa: 99000 }),
      );
      expect((prisma as any).order.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'released' }) }),
      );
    });

    it("ne passe JAMAIS la commande en released si le reversement échoue (règle section 6.2)", async () => {
      (prisma as any).order.findUnique.mockResolvedValue({
        id: 'order-1',
        buyerId: 'buyer-1',
        sellerId: 'seller-1',
        status: 'paid_escrow',
        amountFcfa: 100000,
        platformFeeFcfa: 1000,
      });
      payments.payoutToSeller.mockResolvedValue({ status: 'failed' } as any);

      await expect(service.confirmReceipt('order-1', 'buyer-1', '+225 00 00 00 00 00')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect((prisma as any).order.update).not.toHaveBeenCalled();
    });
  });
});
