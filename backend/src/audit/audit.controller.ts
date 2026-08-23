import { Controller, Get, Query } from '@nestjs/common';
import { AuditAction, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

class AuditQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsEnum(AuditAction) action?: AuditAction;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

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
    const { items, total } = await this.auditService.findAll({
      entityType: query.entityType,
      entityId: query.entityId,
      userId: query.userId,
      action: query.action,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page,
      limit,
    });
    return { items, meta: buildPaginationMeta(page, limit, total) };
  }
}
