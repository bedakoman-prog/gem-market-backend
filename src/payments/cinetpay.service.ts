import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

// Intégration CinetPay — basée sur la documentation publique de l'API Checkout v2
// et de l'API de transfert (client.cinetpay.com). Non testée avec de vraies
// clés (aucun identifiant contractuel disponible au moment de l'écriture) :
// à valider en sandbox avant toute mise en production (section 6 du cahier
// des charges).
//
// Deux briques bien séparées côté CinetPay, sans lien entre elles :
//  - checkout/collect : encaissement acheteur -> compte agrégateur GEM Market
//  - transfer         : reversement compte agrégateur -> vendeur (auth différente)

export interface CheckoutResult {
  providerTransactionId: string;
  paymentUrl: string;
}

export interface CheckStatusResult {
  rawStatus: string;
  isPaid: boolean;
}

export interface TransferResult {
  providerTransferId: string;
  rawStatus: string;
}

@Injectable()
export class CinetpayService {
  private readonly logger = new Logger('CinetPay');

  constructor(private config: ConfigService) {}

  async initCheckout(params: {
    transactionId: string;
    amountFcfa: number;
    description: string;
    customerPhone: string;
  }): Promise<CheckoutResult> {
    const baseUrl = this.config.get<string>('CINETPAY_BASE_URL');
    const apiKey = this.config.get<string>('CINETPAY_API_KEY');
    const siteId = this.config.get<string>('CINETPAY_SITE_ID');

    if (!apiKey || !siteId) {
      this.logger.warn('CINETPAY_API_KEY / CINETPAY_SITE_ID absents — mode simulation (sandbox non configuré).');
      return {
        providerTransactionId: params.transactionId,
        paymentUrl: `https://sandbox.local/simulated-checkout/${params.transactionId}`,
      };
    }

    const { data } = await axios.post(`${baseUrl}/payment`, {
      apikey: apiKey,
      site_id: siteId,
      transaction_id: params.transactionId,
      amount: params.amountFcfa,
      currency: 'XOF',
      description: params.description,
      customer_phone_number: params.customerPhone,
      channels: 'ALL',
    });

    return {
      providerTransactionId: params.transactionId,
      paymentUrl: data?.data?.payment_url,
    };
  }

  // À rappeler systématiquement après réception d'un webhook — jamais faire
  // confiance au contenu du webhook seul (documentation CinetPay, section 6.2).
  async checkStatus(transactionId: string): Promise<CheckStatusResult> {
    const baseUrl = this.config.get<string>('CINETPAY_BASE_URL');
    const apiKey = this.config.get<string>('CINETPAY_API_KEY');
    const siteId = this.config.get<string>('CINETPAY_SITE_ID');

    if (!apiKey || !siteId) {
      this.logger.warn('Mode simulation : statut ACCEPTED renvoyé sans appel réel.');
      return { rawStatus: 'ACCEPTED', isPaid: true };
    }

    const { data } = await axios.post(`${baseUrl}/payment/check`, {
      apikey: apiKey,
      site_id: siteId,
      transaction_id: transactionId,
    });

    const rawStatus = data?.data?.status ?? 'UNKNOWN';
    return { rawStatus, isPaid: rawStatus === 'ACCEPTED' };
  }

  // Reversement vendeur — authentification séparée de l'API checkout
  // (client.cinetpay.com). Nécessite d'avoir préalablement enregistré le
  // vendeur comme "contact" de transfert (non implémenté ici, à faire à
  // l'inscription du vendeur en tant que Boutique Pro).
  async transferToSeller(params: {
    sellerPhone: string;
    amountFcfa: number;
    clientTransferId: string;
  }): Promise<TransferResult> {
    const login = this.config.get<string>('CINETPAY_TRANSFER_LOGIN');
    const password = this.config.get<string>('CINETPAY_TRANSFER_PASSWORD');
    const baseUrl = this.config.get<string>('CINETPAY_TRANSFER_BASE_URL');

    if (!login || !password) {
      this.logger.warn('CINETPAY_TRANSFER_LOGIN/PASSWORD absents — mode simulation.');
      return { providerTransferId: params.clientTransferId, rawStatus: 'queued' };
    }

    const auth = await axios.post(`${baseUrl}/auth/login`, { login, password });
    const token = auth.data?.data?.token;

    const { data } = await axios.post(
      `${baseUrl}/transfer/money/send`,
      {
        prefix: '225',
        phone: params.sellerPhone,
        amount: params.amountFcfa,
        notify_url: undefined,
        client_transaction_id: params.clientTransferId,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    return { providerTransferId: params.clientTransferId, rawStatus: data?.data?.status ?? 'queued' };
  }
}
