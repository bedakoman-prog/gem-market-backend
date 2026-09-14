import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Interface volontairement minimale : dans une vraie version, on branche ici
// un vrai fournisseur SMS ivoirien/régional (ex. Orange, MTN, Twilio, Vonage…).
// Le cahier des charges (section 4) impose l'OTP par SMS comme premier facteur
// d'inscription/connexion — voir OTP_PROVIDER dans .env.example.
export interface SmsSender {
  send(phone: string, message: string): Promise<void>;
}

@Injectable()
class ConsoleSmsSender implements SmsSender {
  private readonly logger = new Logger('SMS(dev)');
  async send(phone: string, message: string): Promise<void> {
    // En développement, on affiche le code au lieu d'envoyer un vrai SMS.
    this.logger.log(`→ ${phone}: ${message}`);
  }
}

@Injectable()
export class OtpService {
  private readonly sender: SmsSender;
  private readonly ttlSeconds: number;

  constructor(private config: ConfigService) {
    // TODO(prod) : si OTP_PROVIDER !== 'console', instancier ici le vrai
    // client SMS au lieu de ConsoleSmsSender.
    this.sender = new ConsoleSmsSender();
    this.ttlSeconds = Number(this.config.get('OTP_CODE_TTL_SECONDS') ?? 300);
  }

  generateCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  get ttl(): number {
    return this.ttlSeconds;
  }

  async sendCode(phone: string, code: string): Promise<void> {
    await this.sender.send(phone, `Votre code GEM Market : ${code} (valable ${Math.round(this.ttlSeconds / 60)} min)`);
  }
}
