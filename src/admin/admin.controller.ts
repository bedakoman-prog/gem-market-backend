import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { SetRoleDto } from './dto/set-role.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';

@Controller('admin')
    @UseGuards(RolesGuard)
    export class AdminController {
    constructor(private adminService: AdminService) {}

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

  // Actions financieres : reservees a admin (au-dessus de moderator).
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

  // Gestion des roles : reservee a admin (remplace l'acces direct a la base).
@Roles(Role.admin)
    @Patch('users/:id/role')
    setUserRole(@Param('id') id: string, @Body() dto: SetRoleDto) {
          return this.adminService.setUserRole(id, dto.role);
    }

  // Suspension/bannissement (section 7) : reserve aux comptes "user" (voir
  // AdminService.suspendUser) - niveau moderator, comme les autres actions de
  // moderation de premier niveau (signalements, annonces).
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
