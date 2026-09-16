// Détection et masquage des coordonnées de contact externes (téléphone,
// email, réseaux sociaux) dans les messages de la messagerie interne.
//
// Objectif (section 5) : les échanges acheteur/vendeur doivent rester sur
// GEM Market. C'est ce qui permet à la plateforme d'arbitrer un litige —
// un accord pris par téléphone ou WhatsApp en dehors de l'appli n'est pas
// traçable et n'est donc pas couvert par le paiement sécurisé en séquestre.
//
// Limite connue : la détection de numéro de téléphone se base sur des
// suites de chiffres, ce qui peut occasionnellement masquer un montant
// (ex. "12 500 000 FCFA") si le mot-clé de devise n'est pas assez proche du
// nombre. C'est un compromis pragmatique — mieux vaut sur-filtrer un prix de
// temps en temps que de laisser passer un numéro de téléphone.

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Suites de 8 à 15 chiffres, séparateurs espace/point/tiret tolérés entre
// deux chiffres : couvre les numéros ivoiriens (10 chiffres, ex. 07 07 07 07
// 07) et internationaux (+225 07 07 07 07 07).
const PHONE_REGEX = /\+?(?:\d[ .-]?){7,14}\d/g;

const CURRENCY_CONTEXT = /(fcfa|cfa|xof|francs?|f\b)/i;

const EXTERNAL_APP_REGEX =
  /(whats\s*app|t[ée]l[ée]gram|instagram|facebook|messenger|snap\s*chat|tiktok|viber|\bimo\b|\bsignal\b)/gi;

function isNearCurrency(source: string, index: number, length: number): boolean {
  const before = source.slice(Math.max(0, index - 12), index);
  const after = source.slice(index + length, index + length + 12);
  return CURRENCY_CONTEXT.test(before) || CURRENCY_CONTEXT.test(after);
}

export function sanitizeMessageBody(raw: string): { body: string; flagged: boolean } {
  let flagged = false;

  let body = raw.replace(EMAIL_REGEX, () => {
    flagged = true;
    return '[coordonnées masquées]';
  });

  body = body.replace(EXTERNAL_APP_REGEX, () => {
    flagged = true;
    return '[application externe masquée]';
  });

  body = body.replace(PHONE_REGEX, (match: string, offset: number, source: string) => {
    if (isNearCurrency(source, offset, match.length)) return match;
    flagged = true;
    return '[coordonnées masquées]';
  });

  return { body, flagged };
}
