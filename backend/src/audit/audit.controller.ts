//backend/src/audit/audit.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { buildDateRange } from '../common/utils/date-range.util';
import { AuditQueryDto } from './dto/audit-query.dto';

/**
 * Le journal d'audit n'est consultable que par le superadmin (section 17 :
 * "ne doit pas etre modifiable par les utilisateurs standards" - ici on va
 * plus loin en le rendant aussi non consultable par eux, le detail des
 * operations d'autrui n'ayant pas a leur etre expose).
 */
@Controller('audit-logs')
@Roles(UserRole.SUPERADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async findAll(@Query() query: AuditQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    // Une date seule ("2026-03-31") pour `to` inclut toute la journee.
    const { items, total } = await this.auditService.findAll({
      entityType: query.entityType,
      entityId: query.entityId,
      userId: query.userId,
      action: query.action,
      createdAt: buildDateRange(query.from, query.to),
      page,
      limit,
    });
    return { items, meta: buildPaginationMeta(page, limit, total) };
  }
}
