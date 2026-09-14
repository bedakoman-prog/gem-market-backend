import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ConversationsService } from './conversations.service';
import { StartConversationDto } from './dto/start-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';

@Controller('conversations')
export class ConversationsController {
  constructor(private conversationsService: ConversationsService) {}

  @Get()
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.conversationsService.findMine(user.id);
  }

  @Post()
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartConversationDto) {
    return this.conversationsService.start(user.id, dto.listingId, dto.body);
  }

  @Get(':id/messages')
  messages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.conversationsService.findMessages(id, user.id);
  }

  @Post(':id/messages')
  postMessage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateMessageDto) {
    return this.conversationsService.postMessage(id, user.id, dto.body);
  }
}
