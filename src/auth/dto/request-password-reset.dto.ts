import { IsEmail, IsString } from 'class-validator';

// Étape 1/2 de la réinitialisation "mot de passe oublié" : on confirme que
// phone+email correspondent bien à un compte existant, puis on envoie un code
// OTP sur ce téléphone (même mécanisme que l'inscription — voir otp.service.ts).
// Corrige la faille initiale : phone+email seuls ne suffisaient plus à changer
// le mot de passe de n'importe qui, il fallait aussi le code reçu sur le
// téléphone du titulaire du compte.
export class RequestPasswordResetDto {
  @IsString()
  phone!: string;

  @IsEmail()
  email!: string;
}
