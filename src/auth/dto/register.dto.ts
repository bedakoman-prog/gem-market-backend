import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

// POST /auth/register — inscription complète : la simple vérification par SMS
// (OTP) ne suffit plus (aucun fournisseur SMS réel n'est branché en Phase 0 —
// voir otp.service.ts). On demande donc dès l'inscription les informations
// minimales pour identifier et contacter un utilisateur : email, mot de passe,
// identité, pays, ville, adresse — en plus du téléphone.
export class RegisterDto {
  // Format international E.164 (indicatif pays obligatoire, ex. +2250758123456)
  // — composé côté frontend via le sélecteur d'indicatif (voir
  // lib/countryDialCodes.ts). Sans indicatif, le lien WhatsApp "Contacter le
  // vendeur" (wa.me, voir listings/[id]/page.tsx) ne fonctionne pas.
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: "Le numéro de téléphone doit inclure l'indicatif du pays (format international, ex. +2250758123456).",
  })
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
