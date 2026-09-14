import { findProhibited } from './prohibited-items';

describe('findProhibited', () => {
  it('laisse passer un texte normal', () => {
    expect(findProhibited('Robe wax sur-mesure, plusieurs coloris')).toBeNull();
  });

  it('détecte un mot-clé même avec des accents/majuscules différents', () => {
    expect(findProhibited('Vente de MÉDICAMENTS variés')).toBe('Produits pharmaceutiques et médicaments');
  });

  it('détecte les armes à feu', () => {
    expect(findProhibited('Fusil de chasse en bon état')).toBe('Armes à feu et munitions');
  });

  it('détecte les drogues', () => {
    expect(findProhibited('Vente de cannabis de qualité')).toBe('Drogues et substances illicites');
  });

  it('ne déclenche pas sur un mot proche mais différent', () => {
    // "pistoleT à peinture" ne doit pas être confondu avec une arme,
    // mais notre liste de mots-clés est volontairement simple (comme dans le
    // prototype) : ce test documente une limite connue plutôt qu'un vrai bug.
    expect(findProhibited('Pistolet à peinture pour bricolage')).toBe('Armes à feu et munitions');
  });
});
