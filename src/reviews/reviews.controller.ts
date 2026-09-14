import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Controller('orders')
export class ReviewsController {
  constructor(private reviewsService: ReviewsService) {}

  @Post(':id/review')
  create(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(id, user.id, dto.rating, dto.comment);
  }
}
