import { Module } from '@nestjs/common';
import { PromoPeriodModule } from '../common/promo/promo-period.module';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';

@Module({
  imports: [PromoPeriodModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
