// Liste reprise telle quelle du prototype (gem-market.html, PROHIBITED_ITEMS).
// Le prototype ne fait ce contrôle que côté client ; ici il est revalidé
// côté serveur à la publication d'une annonce (section 7 du cahier des charges :
// "toujours revalider côté serveur, un contrôle client peut être contourné").

export interface ProhibitedCategory {
  label: string;
  keywords: string[];
}

export const PROHIBITED_ITEMS: ProhibitedCategory[] = [
  {
    // Volontairement ciblé sur le médicament lui-même (nécessite une
    // prescription/est un produit pharmaceutique réglementé), pas sur le
    // matériel médical ou paramédical vendu librement (sparadrap, seringues,
    // compresses...) ni sur les compléments alimentaires — qui eux restent
    // autorisés même si leur description mentionne la pharmacie comme canal
    // de vente ou se présente sous forme de comprimés/gélules.
    label: 'Produits pharmaceutiques et médicaments',
    keywords: [
      'medicament', 'medicaments', 'antibiotique', 'antibiotiques',
      'ordonnance', 'anxiolytique', 'antidouleur', 'tramadol', 'morphine',
    ],
  },
  {
    label: 'Drogues et substances illicites',
    keywords: [
      'drogue', 'drogues', 'stupefiant', 'stupefiants', 'cannabis', 'marijuana',
      'chanvre indien', 'cocaine', 'heroine', 'crack', 'ecstasy', 'methamphetamine',
      'opium', 'haschich',
    ],
  },
  {
    label: 'Armes à feu et munitions',
    keywords: [
      'arme a feu', 'armes a feu', 'fusil', 'fusils', 'pistolet', 'pistolets',
      'revolver', 'revolvers', 'munition', 'munitions', 'kalachnikov', 'carabine', 'carabines',
    ],
  },
];

function normalizeTxt(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Retourne le libellé de la catégorie interdite détectée, ou null si le texte est propre.
export function findProhibited(text: string): string | null {
  const t = normalizeTxt(text);
  for (const item of PROHIBITED_ITEMS) {
    for (const kw of item.keywords) {
      if (t.indexOf(kw) > -1) return item.label;
    }
  }
  return null;
}
