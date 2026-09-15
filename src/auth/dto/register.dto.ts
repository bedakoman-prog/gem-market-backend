import { IsEmail, IsString, MinLength } from 'class-validator';

// POST /auth/register — inscription complète : la simple vérification par SMS
// (OTP) ne suffit plus (aucun fournisseur SMS réel n'est branché en Phase 0 —
// voir otp.service.ts). On demande donc dès l'inscription les informations
// minimales pour identifier et contacter un utilisateur : email, mot de passe,
// identité, pays, ville, adresse — en plus du téléphone.
export class RegisterDto {
  @IsString()
  phone!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  name!: string;

  @IsString()
  country!: string;

  @IsString()
  city!: string;

  @IsString()
  address!: string;
}
