import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('reports')
  reports() {
    return this.adminService.findReports();
  }

  @Post('reports/:id/review')
  reviewReport(@Param('id') id: string, @Body('status') status: 'reviewed' | 'dismissed') {
    return this.adminService.reviewReport(id, status);
  }

  @Post('listings/:id/reject')
  rejectListing(@Param('id') id: string) {
    return this.adminService.rejectListing(id);
  }
}
