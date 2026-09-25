import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  // Nom de boutique affiché aux acheteurs à la place de `name` (annonces,
  // fiche boutique, messagerie). Chaîne vide envoyée volontairement pour
  // revenir au nom personnel : voir UsersService.updateMe.
  @IsOptional()
  @IsString()
  @MaxLength(80)
  shopName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  isSeller?: boolean;
}
