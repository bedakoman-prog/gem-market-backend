import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { SetRoleDto } from './dto/set-role.dto';

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
}
