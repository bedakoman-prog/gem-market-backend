import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';
import { CheckoutResult, CheckStatusResult, TransferResult } from './cinetpay.service';

// Intégration PayDunya — basée sur la documentation publique (checkout-invoice
// + disburse). Non testée avec de vraies clés : à valider en sandbox
// (PAYDUNYA_MODE=test) avant toute mise en production (section 6).
@Injectable()
export class PaydunyaService {
  private readonly logger = new Logger('PayDunya');

  constructor(private config: ConfigService) {}

  private get headers() {
    return {
      'PAYDUNYA-MASTER-KEY': this.config.get<string>('PAYDUNYA_MASTER_KEY'),
      'PAYDUNYA-PRIVATE-KEY': this.config.get<string>('PAYDUNYA_PRIVATE_KEY'),
      'PAYDUNYA-PUBLIC-KEY': this.config.get<string>('PAYDUNYA_PUBLIC_KEY'),
      'PAYDUNYA-TOKEN': this.config.get<string>('PAYDUNYA_TOKEN'),
      'Content-Type': 'application/json',
    };
  }

  async initCheckout(params: {
    transactionId: string;
    amountFcfa: number;
    description: string;
  }): Promise<CheckoutResult> {
    const baseUrl = this.config.get<string>('PAYDUNYA_BASE_URL');
    const masterKey = this.config.get<string>('PAYDUNYA_MASTER_KEY');

    if (!masterKey) {
      this.logger.warn('Clés PayDunya absentes — mode simulation (sandbox non configuré).');
      return {
        providerTransactionId: params.transactionId,
        paymentUrl: `https://sandbox.local/simulated-checkout/${params.transactionId}`,
        simulated: true,
      };
    }

    const { data } = await axios.post(
      `${baseUrl}/checkout-invoice/create`,
      {
        invoice: {
          total_amount: params.amountFcfa,
          description: params.description,
        },
        custom_data: { transaction_id: params.transactionId },
      },
      { headers: this.headers },
    );

    return {
      providerTransactionId: data?.token ?? params.transactionId,
      paymentUrl: data?.response_text ? data.invoice_url : data?.invoice_url,
    };
  }

  // PayDunya envoie un champ `hash` dans le webhook, à recalculer et comparer
  // côté serveur (SHA-512 de la master key) avant de faire confiance au
  // contenu — c'est la protection anti-fraude documentée par PayDunya
  // (section 6.2, "ne jamais faire confiance au webhook seul").
  verifyWebhookHash(payload: { hash?: string }): boolean {
    const masterKey = this.config.get<string>('PAYDUNYA_MASTER_KEY');
    if (!masterKey || !payload.hash) return false;
    const expected = crypto.createHash('sha512').update(masterKey).digest('hex');
    return expected === payload.hash;
  }

  async checkStatus(invoiceToken: string): Promise<CheckStatusResult> {
    const baseUrl = this.config.get<string>('PAYDUNYA_BASE_URL');
    const masterKey = this.config.get<string>('PAYDUNYA_MASTER_KEY');

    if (!masterKey) {
      this.logger.warn('Mode simulation : statut completed renvoyé sans appel réel.');
      return { rawStatus: 'completed', isPaid: true };
    }

    const { data } = await axios.get(`${baseUrl}/checkout-invoice/confirm/${invoiceToken}`, {
      headers: this.headers,
    });

    const rawStatus = data?.status ?? 'unknown';
    return { rawStatus, isPaid: rawStatus === 'completed' };
  }

  // Reversement vendeur : création puis soumission d'une "invoice de désbours".
  async disburseToSeller(params: {
    sellerAccountAlias: string; // ex. numéro mobile money du vendeur
    amountFcfa: number;
    clientTransferId: string;
  }): Promise<TransferResult> {
    const baseUrl = this.config.get<string>('PAYDUNYA_BASE_URL');
    const masterKey = this.config.get<string>('PAYDUNYA_MASTER_KEY');

    if (!masterKey) {
      this.logger.warn('Mode simulation — reversement PayDunya non envoyé.');
      return { providerTransferId: params.clientTransferId, rawStatus: 'queued' };
    }

    const invoiceRes = await axios.post(
      `${baseUrl}/disburse/get-invoice`,
      { account_alias: params.sellerAccountAlias, amount: params.amountFcfa },
      { headers: this.headers },
    );
    const disburseToken = invoiceRes.data?.disburse_token;

    const submitRes = await axios.post(
      `${baseUrl}/disburse/submit-invoice`,
      { disburse_invoice: disburseToken, disburse_token: params.clientTransferId },
      { headers: this.headers },
    );

    return { providerTransferId: disburseToken, rawStatus: submitRes.data?.response_text ?? 'queued' };
  }
}
