import { Body, Controller, Post } from '@nestjs/common';
import { TranslateService } from './translate.service';
import { TranslateDto } from './dto/translate.dto';

// Authentification requise par défaut (JwtAuthGuard global, voir app.module.ts) :
// seuls les utilisateurs connectés peuvent traduire des messages.
@Controller('translate')
export class TranslateController {
  constructor(private translateService: TranslateService) {}

  @Post()
  translate(@Body() dto: TranslateDto) {
    return this.translateService.translate(dto.text, dto.target);
  }
}
