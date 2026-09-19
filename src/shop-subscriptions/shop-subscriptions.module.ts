import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { PromoPeriodModule } from '../common/promo/promo-period.module';
import { ShopSubscriptionsController } from './shop-subscriptions.controller';
import { ShopSubscriptionsService } from './shop-subscriptions.service';

@Module({
  imports: [PaymentsModule, PromoPeriodModule],
  controllers: [ShopSubscriptionsController],
  providers: [ShopSubscriptionsService],
})
export class ShopSubscriptionsModule {}
