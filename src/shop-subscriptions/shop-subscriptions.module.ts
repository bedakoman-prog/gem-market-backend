import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { ShopSubscriptionsController } from './shop-subscriptions.controller';
import { ShopSubscriptionsService } from './shop-subscriptions.service';

@Module({
  imports: [PaymentsModule],
  controllers: [ShopSubscriptionsController],
  providers: [ShopSubscriptionsService],
})
export class ShopSubscriptionsModule {}
