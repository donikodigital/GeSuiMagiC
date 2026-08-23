import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';

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

  @Patch(':id/read')
  async markAsRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.notificationsService.markAsRead(user.userId, id);
    return { marked: true };
  }

  @Patch('read-all')
  async markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    await this.notificationsService.markAllAsRead(user.userId);
    return { marked: true };
  }
}
