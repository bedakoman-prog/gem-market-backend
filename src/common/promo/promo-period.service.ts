import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Période promotionnelle de lancement (décision produit : 3 à 6 mois) — les
// vendeurs publient gratuitement leurs annonces bien/service/emploi (pas
// besoin d'abonnement Boutique actif) pendant cette fenêtre. Le séquestre des
// paiements (commandes, OrdersEscrowScheduler) n'est PAS concerné : il
// démarre normalement dès le lancement, indépendamment de cette promo — ce
// sont deux mécanismes distincts.
//
// Contrôlée par deux variables d'environnement :
//   LAUNCH_DATE                 date ISO du lancement réel (ex. "2026-10-01").
//                                Tant qu'elle n'est pas renseignée, la promo
//                                est considérée INACTIVE : le comportement
//                                actuel (abonnement requis) ne change pas
//                                pendant la phase de tests.
//   PROMO_FREE_LISTING_MONTHS   durée de la gratuité en mois (défaut : 4,
//                                au milieu de la fourchette 3-6 décidée).
//
// Une fois LAUNCH_DATE fixée, la bascule gratuit -> payant se fait toute
// seule à l'échéance, sans intervention manuelle.
@Injectable()
export class PromoPeriodService {
  constructor(private config: ConfigService) {}

  private launchDate(): Date | null {
    const raw = this.config.get<string>('LAUNCH_DATE');
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private promoMonths(): number {
    return Number(this.config.get('PROMO_FREE_LISTING_MONTHS') ?? 4);
  }

  // Date de fin de la période gratuite, ou null si LAUNCH_DATE n'est pas
  // configurée (donc pas encore de compte à rebours en cours).
  endsAt(): Date | null {
    const launch = this.launchDate();
    if (!launch) return null;
    const end = new Date(launch);
    end.setMonth(end.getMonth() + this.promoMonths());
    return end;
  }

  startsAt(): Date | null {
    return this.launchDate();
  }

  // true entre le lancement (inclus) et la fin de la promo (exclue).
  isActive(): boolean {
    const start = this.startsAt();
    const end = this.endsAt();
    if (!start || !end) return false;
    const now = new Date();
    return now >= start && now < end;
  }
}
