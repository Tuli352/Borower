import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

@ApiTags('Analytics Dashboard')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @ApiOperation({ summary: '[Admin] Get comprehensive dashboard analytics' })
  @ApiQuery({ name: 'timeRange', required: false, enum: ['today', 'week', 'month', 'year'], default: 'week' })
  @Get('dashboard')
  async getDashboardAnalytics(@Query('timeRange') timeRange: 'today' | 'week' | 'month' | 'year' = 'week', @Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (!userRole.includes('admin')) {
      throw new Error('Admin access required');
    }

    return this.analyticsService.getDashboardAnalytics(timeRange);
  }

  @ApiOperation({ summary: '[Admin] Get real-time metrics' })
  @Get('realtime')
  async getRealTimeMetrics(@Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (!userRole.includes('admin')) {
      throw new Error('Admin access required');
    }
  }

  @ApiOperation({ summary: '[Admin] Get analytics data (frontend compatibility)' })
  @Get()
  async getAnalytics(@Query('range') range: 'today' | 'week' | 'month' | 'year' = 'week', @Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (!userRole.includes('admin')) {
      throw new Error('Admin access required');
    }

    const timeRange = range || 'week';
    return this.analyticsService.getDashboardAnalytics(timeRange);
  }

  private getDateRange(range: string | undefined): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date();
    const end = new Date();

    switch ((range || 'week').toLowerCase()) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'week':
        start.setDate(now.getDate() - 7);
        end.setHours(23, 59, 59, 999);
        break;
      case 'month':
        start.setMonth(now.getMonth() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case 'year':
        start.setFullYear(now.getFullYear() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      default:
        start.setDate(now.getDate() - 7);
        end.setHours(23, 59, 59, 999);
        break;
    }

    return { start, end };
  }

  @ApiOperation({ summary: '[Admin] Get revenue analytics' })
  @ApiQuery({ name: 'timeRange', required: false, enum: ['today', 'week', 'month', 'year'], default: 'week' })
  @Get('revenue')
  async getRevenueAnalytics(@Query('timeRange') timeRange: 'today' | 'week' | 'month' | 'year' = 'week', @Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (!userRole.includes('admin')) {
      throw new Error('Admin access required');
    }

    const dateRange = this.getDateRange(timeRange);
    return this.analyticsService.getRevenueAnalytics(dateRange);
  }

  @ApiOperation({ summary: '[Admin] Get users analytics' })
  @ApiQuery({ name: 'timeRange', required: false, enum: ['today', 'week', 'month', 'year'], default: 'week' })
  @Get('users')
  async getUsersAnalytics(@Query('timeRange') timeRange: 'today' | 'week' | 'month' | 'year' = 'week', @Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (!userRole.includes('admin')) {
      throw new Error('Admin access required');
    }

    const dateRange = this.getDateRange(timeRange);
    return this.analyticsService.getUsersAnalytics(dateRange);
  }

  @ApiOperation({ summary: '[Admin] Get performance analytics' })
  @ApiQuery({ name: 'timeRange', required: false, enum: ['today', 'week', 'month', 'year'], default: 'week' })
  @Get('performance')
  async getPerformanceAnalytics(@Query('timeRange') timeRange: 'today' | 'week' | 'month' | 'year' = 'week', @Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (!userRole.includes('admin')) {
      throw new Error('Admin access required');
    }

    const dateRange = this.getDateRange(timeRange);
    return this.analyticsService.getPerformanceAnalytics(dateRange);
  }

  @ApiOperation({ summary: '[Admin] Get geographic analytics' })
  @ApiQuery({ name: 'timeRange', required: false, enum: ['today', 'week', 'month', 'year'], default: 'week' })
  @Get('geographic')
  async getGeographicAnalytics(@Query('timeRange') timeRange: 'today' | 'week' | 'month' | 'year' = 'week', @Request() req: any) {
    const userRole = (req.user.role || '').toLowerCase();
    if (!userRole.includes('admin')) {
      throw new Error('Admin access required');
    }

    const dateRange = this.getDateRange(timeRange);
    return this.analyticsService.getGeographicAnalytics(dateRange);
  }
}
