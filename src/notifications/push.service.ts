import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

// Notifications Web Push (section 5 : prévenir l'autre partie d'un nouveau
// message de messagerie, même quand l'appli n'est pas ouverte à l'écran).
// Repose sur l'API standard Push du navigateur (aucun compte tiers requis,
// contrairement à FCM/OneSignal) : une paire de clés VAPID identifie le
// serveur auprès des services de push (Chrome, Firefox...), voir
// VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY dans .env.example.
export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger('PushService');
  private configured = false;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT') || 'mailto:contact@trouvetout.app';

    if (!publicKey || !privateKey) {
      // Pas bloquant : le reste de l'appli (messagerie, etc.) continue de
      // fonctionner normalement, simplement sans notification push tant que
      // ces deux variables ne sont pas configurées (voir README/.env.example).
      this.logger.warn(
        'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY non configurés : notifications push désactivées.',
      );
      return;
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.configured = true;
  }

  get publicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') || null;
  }

  async saveSubscription(userId: string, endpoint: string, p256dh: string, auth: string) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId, p256dh, auth },
      create: { userId, endpoint, p256dh, auth },
    });
    return { ok: true };
  }

  async removeSubscription(endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
    return { ok: true };
  }

  // Envoie à tous les appareils abonnés de l'utilisateur. N'échoue jamais
  // bruyamment : un envoi push est une amélioration, pas un pré-requis pour
  // que la messagerie fonctionne (voir ConversationsService).
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.configured) return;
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return;

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // Abonnement périmé côté navigateur (désinstallation, cache vidé...)
            // — on le retire pour ne plus réessayer inutilement à chaque message.
            await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          } else {
            this.logger.warn(`Échec d'envoi push (${sub.endpoint}) : ${(err as Error)?.message || err}`);
          }
        }
      }),
    );
  }
}
