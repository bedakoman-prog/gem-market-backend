import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { PushService } from './push.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { UnsubscribeDto } from './dto/unsubscribe.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private pushService: PushService) {}

  // Clé publique VAPID nécessaire au navigateur pour créer l'abonnement push
  // (PushManager.subscribe) — voir src/lib/push.ts côté frontend. Pas un
  // secret : c'est la clé privée (VAPID_PRIVATE_KEY) qui ne quitte jamais le
  // serveur.
  @Get('vapid-public-key')
  vapidPublicKey() {
    return { publicKey: this.pushService.publicKey };
  }

  @Post('subscribe')
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubscribeDto) {
    return this.pushService.saveSubscription(user.id, dto.endpoint, dto.keys.p256dh, dto.keys.auth);
  }

  @Delete('subscribe')
  unsubscribe(@Body() dto: UnsubscribeDto) {
    return this.pushService.removeSubscription(dto.endpoint);
  }
}
