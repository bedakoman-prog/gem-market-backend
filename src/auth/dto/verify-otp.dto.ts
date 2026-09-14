import { IsOptional, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  phone!: string;

  @IsString()
  @Length(6, 6)
  code!: string;

  // Renseigné seulement à la toute première inscription (le téléphone est
  // l'identifiant principal — section 4 du cahier des charges).
  @IsOptional()
  @IsString()
  name?: string;
}
