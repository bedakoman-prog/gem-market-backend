import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UsersService } from './users.service';
import { UpdateMeDto } from './dto/update-me.dto';

@Controller('users')
  export class UsersController {
    constructor(private usersService: UsersService) {}

  @Get('me')
    me(@CurrentUser() user: AuthenticatedUser) {
          return this.usersService.me(user.id);
    }

  @Patch('me')
    updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMeDto) {
          return this.usersService.updateMe(user.id, dto);
    }
}
