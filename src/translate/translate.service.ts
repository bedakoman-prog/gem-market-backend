import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

// Traduction des messages de la messagerie acheteur/vendeur (section 5 :
// conversation "traduisible en plusieurs langues"). On s'appuie sur le
// point de terminaison public non-officiel de Google Translate (gratuit,
// sans clé API) — solution pragmatique en l'absence d'un compte Google
// Cloud Translation payant. À remplacer par l'API officielle si le volume
// grandit ou si ce point de terminaison devient indisponible.
@Injectable()
export class TranslateService {
  private readonly logger = new Logger('Translate');

  async translate(text: string, target: string): Promise<{ translated: string; source: string }> {
    const trimmed = text.trim();
    if (!trimmed) return { translated: text, source: 'auto' };

    try {
      const res = await axios.get('https://translate.googleapis.com/translate_a/single', {
        params: { client: 'gtx', sl: 'auto', tl: target, dt: 't', q: trimmed },
        timeout: 8000,
      });

      // Format de réponse : [[["texte traduit", "texte original", ...], ...], null, "fr", ...]
      const segments: unknown[] = res.data?.[0] ?? [];
      const translated = segments.map((seg) => (Array.isArray(seg) ? String(seg[0] ?? '') : '')).join('');
      const source = typeof res.data?.[2] === 'string' ? res.data[2] : 'auto';

      return { translated: translated || text, source };
    } catch (err) {
      this.logger.warn(`Échec de traduction vers ${target} : ${(err as Error).message}`);
      throw new BadGatewayException('Le service de traduction est momentanément indisponible.');
    }
  }
}
