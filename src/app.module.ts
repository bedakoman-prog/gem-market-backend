import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { ListingsModule } from './listings/listings.module';
import { ShopSubscriptionsModule } from './shop-subscriptions/shop-subscriptions.module';
import { OrdersModule } from './orders/orders.module';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { ConversationsModule } from './conversations/conversations.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ReportsModule } from './reports/reports.module';
import { AdminModule } from './admin/admin.module';
import { MediaModule } from './media/media.module';
import { TranslateModule } from './translate/translate.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Active les tâches planifiées (@Cron) — utilisé par
    // OrdersEscrowScheduler pour la libération automatique du séquestre.
    ScheduleModule.forRoot(),
    // Limitation de débit globale (section 9) — resserrée spécifiquement sur
    // les endpoints OTP via @Throttle() dans AuthController.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ListingsModule,
    ShopSubscriptionsModule,
    OrdersModule,
    BookingsModule,
    PaymentsModule,
    ConversationsModule,
    ReviewsModule,
    ReportsModule,
    AdminModule,
    MediaModule,
    TranslateModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // JWT global : toute route est protégée par défaut, sauf @Public()
    // (voir common/decorators/public.decorator.ts).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
