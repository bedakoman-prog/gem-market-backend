import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

// Langues proposées côté messagerie (section 5). Le code "zh-CN" est celui
// attendu par le point de terminaison de traduction pour le chinois simplifié.
export const SUPPORTED_TRANSLATION_LANGS = [
  'fr',
  'en',
  'es',
  'ar',
  'zh-CN',
  'pt',
  'de',
  'it',
  'nl',
  'ru',
] as const;

export class TranslateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;

  @IsIn(SUPPORTED_TRANSLATION_LANGS)
  target!: string;
}
