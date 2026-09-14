import {
  BadRequestException,
  Controller,
  Delete,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { MediaService } from './media.service';

// POST /listings/:id/media — upload multipart (champ "file"), une pièce à la
// fois pour rester simple ; le prototype affiche jusqu'à quelques photos par
// annonce, cohérent avec les quotas fixés dans MediaService.
@Controller('listings/:listingId/media')
export class MediaController {
  constructor(private mediaService: MediaService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 60 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("Aucun fichier reçu (champ multipart attendu : 'file').");
    return this.mediaService.addToListing(listingId, user.id, file);
  }

  @Delete(':mediaId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.mediaService.remove(listingId, user.id, mediaId);
  }
}
