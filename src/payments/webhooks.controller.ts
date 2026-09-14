import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';

// Endpoints appelés par les prestataires de paiement eux-mêmes, jamais par
// l'app (section 5) — donc @Public(), mais chaque handler revérifie le
// statut/la signature avant de faire confiance au contenu (section 6.2).
@Controller('webhooks')
export class WebhooksController {
  constructor(private paymentsService: PaymentsService) {}

  @Public()
  @Post('cinetpay')
  cinetpay(@Body() payload: Record<string, any>) {
    return this.paymentsService.handleCinetpayWebhook(payload);
  }

  @Public()
  @Post('paydunya')
  paydunya(@Body() payload: Record<string, any>) {
    return this.paymentsService.handlePaydunyaWebhook(payload);
  }
}
