import { Type } from 'class-transformer';
import { IsString, MinLength, ValidateNested } from 'class-validator';

class PushKeysDto {
  @IsString()
  @MinLength(1)
  p256dh!: string;

  @IsString()
  @MinLength(1)
  auth!: string;
}

// Reprend tel quel l'objet retourné par PushSubscription.toJSON() côté
// navigateur (voir src/lib/push.ts côté frontend) — endpoint n'est pas
// forcément une URL "classique" selon le navigateur, d'où IsString simple
// plutôt qu'IsUrl (trop strict, risquerait de rejeter un abonnement valide).
export class SubscribeDto {
  @IsString()
  @MinLength(1)
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}
