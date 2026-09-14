import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentDirection, PaymentProvider, PayoutStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CinetpayService } from './cinetpay.service';
import { PaydunyaService } from './paydunya.service';

// Références de transaction encodées "<type>_<id>" pour retrouver, à la
// réception d'un webhook, quelle commande / réservation / abonnement est
// concerné(e) — voir section 6.2 du cahier des charges.
type PayableKind = 'order' | 'booking' | 'shop';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    private prisma: PrismaService,
    private cinetpay: CinetpayService,
    private paydunya: PaydunyaService,
    private config: ConfigService,
  ) {}

  private defaultProvider(): PaymentProvider {
    return (this.config.get<string>('PAYMENT_DEFAULT_PROVIDER') as PaymentProvider) ?? PaymentProvider.cinetpay;
  }

  private encodeRef(kind: PayableKind, id: string): string {
    return `${kind}_${id}`;
  }

  private decodeRef(ref: string): { kind: PayableKind; id: string } | null {
    const match = /^(order|booking|shop)_(.+)$/.exec(ref);
    if (!match) return null;
    return { kind: match[1] as PayableKind, id: match[2] };
  }

  // Utilisé par OrdersService, BookingsService, ShopSubscriptionsService pour
  // lancer un encaissement (checkout) — la seule étape commune aux 3 cas
  // d'usage payants du cahier des charges (achat en séquestre, réservation
  // d'espace, abonnement boutique).
  async initiateCollect(kind: PayableKind, id: string, amountFcfa: number, description: string, customerPhone: string) {
    const provider = this.defaultProvider();
    const reference = this.encodeRef(kind, id);

    const result =
      provider === PaymentProvider.paydunya
        ? await this.paydunya.initCheckout({ transactionId: reference, amountFcfa, description })
        : await this.cinetpay.initCheckout({ transactionId: reference, amountFcfa, description, customerPhone });

    await this.prisma.paymentEvent.create({
      data: {
        provider,
        providerTransactionId: result.providerTransactionId,
        direction: PaymentDirection.collect,
        rawStatus: 'INITIATED',
        rawPayload: { reference, amountFcfa },
        verified: false,
        ...(kind === 'order' ? { orderId: id } : {}),
        ...(kind === 'booking' ? { bookingId: id } : {}),
        ...(kind === 'shop' ? { shopSubscriptionId: id } : {}),
      },
    });

    return { provider, paymentUrl: result.paymentUrl, reference };
  }

  // POST /webhooks/cinetpay — jamais faire confiance au contenu du webhook
  // seul : on rappelle systématiquement l'endpoint de vérification du
  // prestataire avant de faire passer quoi que ce soit en "payé".
  async handleCinetpayWebhook(payload: Record<string, any>) {
    const reference: string | undefined = payload.cpm_trans_id ?? payload.transaction_id;
    if (!reference) {
      this.logger.warn('Webhook CinetPay reçu sans référence de transaction — ignoré.');
      return { ignored: true };
    }

    const status = await this.cinetpay.checkStatus(reference);
    return this.applyVerifiedCollect(PaymentProvider.cinetpay, reference, status.rawStatus, status.isPaid, payload);
  }

  // POST /webhooks/paydunya — vérifie le hash SHA-512 documenté par PayDunya
  // PUIS re-confirme le statut via leur endpoint, avant de créditer quoi que
  // ce soit (section 6.2).
  async handlePaydunyaWebhook(payload: Record<string, any>) {
    if (!this.paydunya.verifyWebhookHash(payload)) {
      this.logger.warn('Webhook PayDunya avec hash invalide — rejeté (fraude possible).');
      throw new BadRequestException('Signature invalide');
    }

    const reference: string | undefined = payload?.data?.custom_data?.transaction_id ?? payload?.token;
    if (!reference) return { ignored: true };

    const status = await this.paydunya.checkStatus(payload.token);
    return this.applyVerifiedCollect(PaymentProvider.paydunya, reference, status.rawStatus, status.isPaid, payload);
  }

  private async applyVerifiedCollect(
    provider: PaymentProvider,
    reference: string,
    rawStatus: string,
    isPaid: boolean,
    rawPayload: Record<string, any>,
  ) {
    await this.prisma.paymentEvent.create({
      data: {
        provider,
        providerTransactionId: reference,
        direction: PaymentDirection.collect,
        rawStatus,
        rawPayload,
        verified: true,
      },
    });

    if (!isPaid) {
      this.logger.log(`Encaissement ${reference} non confirmé (statut ${rawStatus}) — aucune mise à jour.`);
      return { updated: false, rawStatus };
    }

    const decoded = this.decodeRef(reference);
    if (!decoded) return { updated: false, rawStatus };

    if (decoded.kind === 'order') {
      await this.prisma.order.update({
        where: { id: decoded.id },
        data: {
          status: 'paid_escrow',
          autoReleaseAt: new Date(Date.now() + this.autoReleaseHours() * 3600 * 1000),
        },
      });
    } else if (decoded.kind === 'booking') {
      await this.prisma.booking.update({ where: { id: decoded.id }, data: { status: 'confirmed' } });
    } else if (decoded.kind === 'shop') {
      await this.prisma.shopSubscription.update({ where: { id: decoded.id }, data: { status: 'active' } });
    }

    return { updated: true, rawStatus, kind: decoded.kind, id: decoded.id };
  }

  private autoReleaseHours(): number {
    return Number(this.config.get('ORDER_AUTO_RELEASE_HOURS') ?? 72);
  }

  // Reversement vendeur au moment de la confirmation de réception —
  // appelé par OrdersService.confirmReceipt (section 6.2).
  async payoutToSeller(params: { orderId: string; sellerId: string; sellerPhone: string; amountFcfa: number }) {
    const provider = this.defaultProvider();
    const payout = await this.prisma.payout.create({
      data: {
        orderId: params.orderId,
        sellerId: params.sellerId,
        amountFcfa: params.amountFcfa,
        provider,
        status: PayoutStatus.queued,
      },
    });

    try {
      const result =
        provider === PaymentProvider.paydunya
          ? await this.paydunya.disburseToSeller({
              sellerAccountAlias: params.sellerPhone,
              amountFcfa: params.amountFcfa,
              clientTransferId: payout.id,
            })
          : await this.cinetpay.transferToSeller({
              sellerPhone: params.sellerPhone,
              amountFcfa: params.amountFcfa,
              clientTransferId: payout.id,
            });

      // Le reversement n'est pas forcément instantané (confirmation manuelle
      // ou liste blanche d'IP côté CinetPay) : on le marque "sent", jamais
      // directement "confirmed" tant qu'un webhook/rappel ne l'a pas validé.
      return this.prisma.payout.update({
        where: { id: payout.id },
        data: { status: PayoutStatus.sent, providerTransferId: result.providerTransferId },
      });
    } catch (err) {
      this.logger.error(`Échec du reversement pour la commande ${params.orderId}`, err as Error);
      return this.prisma.payout.update({
        where: { id: payout.id },
        data: { status: PayoutStatus.failed, failureReason: (err as Error).message },
      });
    }
  }
}
