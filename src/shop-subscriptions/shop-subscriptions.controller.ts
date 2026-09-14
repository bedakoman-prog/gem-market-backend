import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ShopSubscriptionsService } from './shop-subscriptions.service';
import { SubscribeDto } from './dto/subscribe.dto';

@Controller('shop')
export class ShopSubscriptionsController {
  constructor(private shopService: ShopSubscriptionsService) {}

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.shopService.status(user.id);
  }

  @Post('subscribe')
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubscribeDto) {
    return this.shopService.subscribe(user.id, dto.days, user.phone);
  }
}
