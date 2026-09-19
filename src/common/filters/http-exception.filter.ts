import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

// Filtre global : uniformise le format d'erreur renvoyé par l'API et
// journalise les erreurs inattendues (utile pour le futur journal d'audit —
// section 9 du cahier des charges).
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // exception.getResponse() renvoie soit une chaîne, soit l'objet complet
    // { statusCode, message, error } construit par NestJS (ForbiddenException,
    // NotFoundException, etc.) — il faut en extraire le texte, sinon le champ
    // "message" ci-dessous devient un objet et s'affiche "[object Object]"
    // côté client au lieu du vrai message d'erreur.
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : exceptionResponse && typeof exceptionResponse === 'object' && 'message' in exceptionResponse
          ? (exceptionResponse as { message: string | string[] }).message
          : 'Erreur interne du serveur';

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url}`, exception instanceof Error ? exception.stack : String(exception));
    }

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message,
    });
  }
}
