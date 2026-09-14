import { IsString, IsUUID } from 'class-validator';

export class StartConversationDto {
  @IsUUID()
  listingId!: string;

  @IsString()
  body!: string;
}
