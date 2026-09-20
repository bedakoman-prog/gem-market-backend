import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersEscrowScheduler } from './orders-escrow.scheduler';

@Module({
    imports: [PaymentsModule],
    controllers: [OrdersController],
    providers: [OrdersService, OrdersEscrowScheduler],
    // AdminModule a besoin de adminReleaseEscrow() pour résoudre un litige en
    // faveur du vendeur (POST /admin/orders/:id/release).
    exports: [OrdersService],
})
  export class OrdersModule {}
