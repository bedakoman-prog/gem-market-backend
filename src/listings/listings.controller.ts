import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { SearchListingsDto } from './dto/search-listings.dto';

@Controller()
export class ListingsController {
  constructor(private listingsService: ListingsService) {}

  @Public()
  @Get('listings')
  findAll(@Query() filters: SearchListingsDto) {
    return this.listingsService.findAll(filters);
  }

  @Public()
  @Get('search')
  search(@Query() filters: SearchListingsDto) {
    return this.listingsService.findAll(filters);
  }

  @Get('listings/mine')
    findMine(@CurrentUser() user: AuthenticatedUser) {
          return this.listingsService.findMine(user.id);
    }
  
    @Public()
  @Get('listings/:id')
  findOne(@Param('id') id: string) {
    return this.listingsService.findOneAndCountView(id);
  }

  @Post('listings')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateListingDto) {
    return this.listingsService.create(user.id, dto);
  }

  @Patch('listings/:id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateListingDto) {
    return this.listingsService.update(user.id, id, dto);
  }

  @Delete('listings/:id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.listingsService.remove(user.id, id);
  }
}
