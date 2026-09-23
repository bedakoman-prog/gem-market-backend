import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { SellersService } from './sellers.service';

@Controller('sellers')
export class SellersController {
  constructor(private sellersService: SellersService) {}

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sellersService.findOne(id);
  }

  @Public()
  @Get(':id/listings')
  findListings(@Param('id') id: string) {
    return this.sellersService.findListings(id);
  }
}

