//backend/src/notifications/notifications.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn } from 'class-validator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-preferences.dto';

class TestMessageDto {
  @IsIn(['WHATSAPP', 'SMS'])
  channel!: 'WHATSAPP' | 'SMS';
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { items, total } = await this.notificationsService.listForUser(user.userId, page, limit);
    return { items, meta: buildPaginationMeta(page, limit, total) };
  }

  @Get('preferences')
  async preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getPreferences(user.userId);
  }

  @Patch('preferences')
  async updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.notificationsService.updatePreferences(user.userId, dto);
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('preferences/test')
  async testMessage(@CurrentUser() user: AuthenticatedUser, @Body() dto: TestMessageDto) {
    return this.notificationsService.sendTestMessage(user.userId, dto.channel);
  }

  // Declaree AVANT ':id/read' par lisibilite ; les deux chemins ne se chevauchent pas (1 vs 2 segments).
  @Patch('read-all')
  async markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    await this.notificationsService.markAllAsRead(user.userId);
    return { marked: true };
  }

  @Patch(':id/read')
  async markAsRead(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.notificationsService.markAsRead(user.userId, id);
    return { marked: true };
  }
}
