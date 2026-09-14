import { Module } from '@nestjs/common';
import { CinetpayService } from './cinetpay.service';
import { PaydunyaService } from './paydunya.service';
import { PaymentsService } from './payments.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  controllers: [WebhooksController],
  providers: [CinetpayService, PaydunyaService, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
