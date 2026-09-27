import { IsInt, Min } from 'class-validator';

// POST /shop/subscribe-extra — achat de capacité supplémentaire au-delà des
// 10 annonces incluses dans l'abonnement Boutique de base (0,5$/jour et par
// annonce). Voir ShopSubscriptionsService.subscribeExtra.
export class SubscribeExtraDto {
  @IsInt()
  @Min(1)
  quantity!: number; // nombre d'annonces supplémentaires souhaitées

  @IsInt()
  @Min(1)
  days!: number;
}
