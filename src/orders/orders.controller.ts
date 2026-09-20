import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OpenDisputeDto } from './dto/open-dispute.dto';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

@Controller('orders')
  export class OrdersController {
    constructor(private ordersService: OrdersService, private prisma: PrismaService) {}

  @Post()
    create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
          return this.ordersService.create(user.id, dto.listingId, user.phone);
    }

  @Get()
    myPurchases(@CurrentUser() user: AuthenticatedUser) {
          return this.ordersService.findMyPurchases(user.id);
    }

  @Get('received')
    mySales(@CurrentUser() user: AuthenticatedUser) {
          return this.ordersService.findMySales(user.id);
    }

  @Post(':id/confirm-receipt')
    async confirmReceipt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
          const order = await this.prisma.order.findUnique({ where: { id }, include: { seller: true } });
          if (!order) throw new NotFoundException('Commande introuvable');
          return this.ordersService.confirmReceipt(id, user.id, order.seller.phone);
    }

  @Post(':id/dispute')
    dispute(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: OpenDisputeDto) {
          return this.ordersService.openDispute(id, user.id, dto.reason);
    }
}
