import { IsEmail, IsString, MinLength } from 'class-validator';

// Réinitialisation "mot de passe oublié" — voir auth.service.ts#resetPassword
// pour le choix de conception (identité confirmée par téléphone + email,
// sans envoi d'e-mail réel puisqu'aucun fournisseur n'est branché en Phase 0).
export class ResetPasswordDto {
  @IsString()
  phone!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}
