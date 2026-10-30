import { IsEmail, IsString, MinLength } from 'class-validator';

// Étape 2/2 de la réinitialisation "mot de passe oublié" — voir
// auth.service.ts#confirmPasswordReset. Le code est celui envoyé par SMS à
// l'étape 1 (RequestPasswordResetDto) : sans code valide, impossible de
// changer le mot de passe, même en connaissant phone+email d'un compte.
export class ResetPasswordDto {
  @IsString()
  phone!: string;

  @IsEmail()
  email!: string;

  @IsString()
  code!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}
