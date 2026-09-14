import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CinetpayService } from './cinetpay.service';
import { PaydunyaService } from './paydunya.service';
import { createPrismaMock } from '../../test/mocks/prisma.mock';
import { createConfigMock } from '../../test/mocks/config.mock';
import { PrismaService } from '../prisma/prisma.service';

// La règle la plus importante de la section 6.2 : ne jamais faire confiance
// au contenu d'un webhook seul. Ces tests vérifient que PaymentsService
// rappelle bien l'API de vérification du prestataire, et rejette tout ce qui
// ne passe pas cette vérification.
describe('PaymentsService', () => {
  let prisma: PrismaService;
  let cinetpay: jest.Mocked<Pick<CinetpayService, 'checkStatus' | 'initCheckout' | 'transferToSeller'>>;
  let paydunya: jest.Mocked<Pick<PaydunyaService, 'checkStatus' | 'initCheckout' | 'verifyWebhookHash' | 'disburseToSeller'>>;
  let service: PaymentsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    cinetpay = {
      checkStatus: jest.fn(),
      initCheckout: jest.fn(),
      transferToSeller: jest.fn(),
    };
    paydunya = {
      checkStatus: jest.fn(),
      initCheckout: jest.fn(),
      verifyWebhookHash: jest.fn(),
      disburseToSeller: jest.fn(),
    };
    const config = createConfigMock({ PAYMENT_DEFAULT_PROVIDER: 'cinetpay', ORDER_AUTO_RELEASE_HOURS: '72' });
    service = new PaymentsService(
      prisma,
      cinetpay as unknown as CinetpayService,
      paydunya as unknown as PaydunyaService,
      config,
    );
  });

  describe('handleCinetpayWebhook', () => {
    it('ignore un webhook sans référence de transaction', async () => {
      const result = await service.handleCinetpayWebhook({});
      expect(result).toEqual({ ignored: true });
      expect(cinetpay.checkStatus).not.toHaveBeenCalled();
    });

    it('ne met rien à jour tant que le rappel de vérification ne confirme pas le paiement', async () => {
      cinetpay.checkStatus.mockResolvedValue({ rawStatus: 'REFUSED', isPaid: false });

      const result = await service.handleCinetpayWebhook({ cpm_trans_id: 'order_abc' });

      expect(cinetpay.checkStatus).toHaveBeenCalledWith('order_abc');
      expect(result).toEqual(expect.objectContaining({ updated: false }));
      expect((prisma as any).order.update).not.toHaveBeenCalled();
    });

    it('passe la commande en paid_escrow seulement après confirmation par checkStatus', async () => {
      cinetpay.checkStatus.mockResolvedValue({ rawStatus: 'ACCEPTED', isPaid: true });

      await service.handleCinetpayWebhook({ cpm_trans_id: 'order_abc' });

      expect((prisma as any).order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'abc' },
          data: expect.objectContaining({ status: 'paid_escrow' }),
        }),
      );
    });

    it('active un abonnement boutique confirmé', async () => {
      cinetpay.checkStatus.mockResolvedValue({ rawStatus: 'ACCEPTED', isPaid: true });

      await service.handleCinetpayWebhook({ cpm_trans_id: 'shop_sub-1' });

      expect((prisma as any).shopSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { status: 'active' },
      });
    });
  });

  describe('handlePaydunyaWebhook', () => {
    it('rejette un webhook dont le hash SHA-512 est invalide (fraude possible)', async () => {
      paydunya.verifyWebhookHash.mockReturnValue(false);

      await expect(service.handlePaydunyaWebhook({ hash: 'faux' })).rejects.toBeInstanceOf(BadRequestException);
      expect(paydunya.checkStatus).not.toHaveBeenCalled();
    });

    it('revérifie le statut auprès de PayDunya avant de mettre à jour quoi que ce soit', async () => {
      paydunya.verifyWebhookHash.mockReturnValue(true);
      paydunya.checkStatus.mockResolvedValue({ rawStatus: 'completed', isPaid: true });

      await service.handlePaydunyaWebhook({
        hash: 'valide',
        token: 'tok-1',
        data: { custom_data: { transaction_id: 'booking_xyz' } },
      });

      expect(paydunya.checkStatus).toHaveBeenCalledWith('tok-1');
      expect((prisma as any).booking.update).toHaveBeenCalledWith({ where: { id: 'xyz' }, data: { status: 'confirmed' } });
    });
  });

  describe('payoutToSeller', () => {
    it('marque le Payout "failed" (jamais confirmed) quand le transfert échoue', async () => {
      (prisma as any).payout.create.mockResolvedValue({ id: 'payout-1' });
      cinetpay.transferToSeller.mockRejectedValue(new Error('numéro invalide'));

      await service.payoutToSeller({ orderId: 'order-1', sellerId: 'seller-1', sellerPhone: '+225 00', amountFcfa: 99000 });

      expect((prisma as any).payout.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
      );
    });
  });
});
