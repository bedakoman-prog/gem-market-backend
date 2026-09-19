import { Module } from '@nestjs/common';
import { PromoPeriodService } from './promo-period.service';

@Module({
  providers: [PromoPeriodService],
  exports: [PromoPeriodService],
})
export class PromoPeriodModule {}
