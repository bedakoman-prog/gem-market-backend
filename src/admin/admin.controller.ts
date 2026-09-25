import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AdminService } from './admin.service';
import { SetRoleDto } from './dto/set-role.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';

@Controller('admin')
  @UseGuards(RolesGuard)
  export class AdminController {
  constructor(private adminService: AdminService) {}

// POST /admin/bootstrap — amorce le tout premier compte admin (aucune route
// PATCH /admin/users/:id/role n'est utilisable tant qu'aucun admin n'existe,
// puisqu'elle est elle-même réservée à un admin : sans ce point d'entrée,
// personne ne pourrait jamais obtenir les droits d'administration). Protégé
// par un secret (ADMIN_BOOTSTRAP_SECRET, à définir sur Render) ET seulement
// tant qu'aucun compte admin n'existe déjà (AdminService.bootstrapFirstAdmin) :
// une fois le premier admin créé, cette route devient définitivement inerte.
// À retirer une fois le premier admin en place (voir suivi produit).
@Public()
  @Post('bootstrap')
  bootstrap(@Headers('x-bootstrap-secret') secret: string, @Body() dto: BootstrapAdminDto) {
    return this.adminService.bootstrapFirstAdmin(secret, dto.email);
  }

@Roles(Role.moderator)
  @Get('reports')
  reports() {
    return this.adminService.findReports();
  }

@Roles(Role.moderator)
  @Post('reports/:id/review')
  reviewReport(@Param('id') id: string, @Body('status') status: 'reviewed' | 'dismissed') {
    return this.adminService.reviewReport(id, status);
  }

@Roles(Role.moderator)
  @Post('listings/:id/reject')
  rejectListing(@Param('id') id: string) {
    return this.adminService.rejectListing(id);
  }

@Roles(Role.moderator)
  @Get('listings/pending')
  pendingListings() {
    return this.adminService.findPendingListings();
  }

@Roles(Role.moderator)
  @Post('listings/:id/approve')
  approveListing(@Param('id') id: string) {
    return this.adminService.approveListing(id);
  }

@Roles(Role.moderator)
  @Get('disputes')
  disputes() {
    return this.adminService.findDisputedOrders();
  }

// Actions financières : réservées à admin (au-dessus de moderator).
@Roles(Role.admin)
  @Post('orders/:id/refund')
  refundOrder(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.adminService.refundOrder(id, reason);
  }

@Roles(Role.admin)
  @Post('orders/:id/release')
  releaseOrder(@Param('id') id: string) {
    return this.adminService.releaseOrder(id);
  }

// Gestion des rôles : réservée à admin (remplace l'accès direct à la base).
@Roles(Role.admin)
  @Patch('users/:id/role')
  setUserRole(@Param('id') id: string, @Body() dto: SetRoleDto) {
    return this.adminService.setUserRole(id, dto.role);
  }

// Suspension/bannissement (section 7) : réservé aux comptes "user" (voir
// AdminService.suspendUser) — niveau moderator, comme les autres actions de
// modération de premier niveau (signalements, annonces).
@Roles(Role.moderator)
  @Post('users/:id/suspend')
  suspendUser(@Param('id') id: string, @Body() dto: SuspendUserDto) {
    return this.adminService.suspendUser(id, dto.reason);
  }

@Roles(Role.moderator)
  @Post('users/:id/unsuspend')
  unsuspendUser(@Param('id') id: string) {
    return this.adminService.unsuspendUser(id);
  }
}
