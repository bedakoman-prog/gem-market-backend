// Sous-catégorisation des annonces de la catégorie "services" (section 5 :
// recherche/filtres) — même principe que job-sectors.ts pour "emploi".
// Référentiel volontairement simple (id + label) : contrairement au secteur
// de métier, on n'a pas besoin ici d'exemples de postes, juste du type de
// prestation proposée.

export interface ServiceType {
  id: string;
  label: string;
}

export const SERVICE_TYPES: ServiceType[] = [
  { id: 'electricite', label: 'Électricité' },
  { id: 'plomberie', label: 'Plomberie' },
  { id: 'mecanique', label: 'Mécanique' },
  { id: 'electromenager', label: 'Électroménager' },
];

export const SERVICE_TYPE_IDS = SERVICE_TYPES.map((s) => s.id);
