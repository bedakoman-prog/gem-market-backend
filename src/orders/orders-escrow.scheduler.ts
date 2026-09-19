import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from './orders.service';

// Tâche planifiée : libère automatiquement le séquestre des commandes dont le
// délai (autoReleaseAt, 72h par défaut — ORDER_AUTO_RELEASE_HOURS) est dépassé
// sans confirmation de réception par l'acheteur. Comble le manque identifié
// dans le cadre de travail de l'administration ("prochaines évolutions
// techniques à prioriser", priorité n°1) : jusqu'ici, sans action du client,
// la commande restait bloquée indéfiniment en paid_escrow.
@Injectable()
export class OrdersEscrowScheduler {
  private readonly logger = new Logger('OrdersEscrowScheduler');

  constructor(private ordersService: OrdersService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredEscrows() {
    const { released, failed } = await this.ordersService.releaseExpiredEscrows();
    if (released > 0 || failed > 0) {
      this.logger.log(
        `Séquestre automatique : ${released} commande(s) libérée(s), ${failed} échec(s) de reversement (restent en paid_escrow, à traiter manuellement).`,
      );
    }
  }
}
