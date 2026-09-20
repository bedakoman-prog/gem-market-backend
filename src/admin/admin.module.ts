import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [PaymentsModule, OrdersModule],
  controllers: [AdminController],
  providers: [AdminService, RolesGuard],
})
  export class AdminModule {}
