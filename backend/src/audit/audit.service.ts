import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma, PrismaClient, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogInput {
  userId?: string | null;
  userRole?: UserRole | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

// Type minimal du client transactionnel Prisma (voir PrismaService.runInTransaction).
// IMPORTANT : derive de PrismaClient, pas de PrismaService (voir wallets.service.ts).
type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Journal d'audit (section 17). INVIOLABLE : aucune methode update/delete
 * n'est exposee ici volontairement. Une fois ecrite, une ligne d'audit ne
 * peut plus etre modifiee ni supprimee par l'application elle-meme.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ecrit une entree d'audit. Si `tx` est fourni (transaction Prisma en
   * cours), l'ecriture rejoint la meme transaction atomique que l'operation
   * metier qu'elle documente (ex: validation d'une depense).
   */
  async log(input: AuditLogInput, tx?: TxClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        userId: input.userId ?? null,
        userRole: input.userRole ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        oldValue: (input.oldValue as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        newValue: (input.newValue as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        reason: input.reason ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }

  async findAll(filters: {
    entityType?: string;
    entityId?: string;
    userId?: string;
    action?: AuditAction;
    from?: Date;
    to?: Date;
    page: number;
    limit: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {
      entityType: filters.entityType,
      entityId: filters.entityId,
      userId: filters.userId,
      action: filters.action,
      createdAt:
        filters.from || filters.to
          ? { gte: filters.from, lte: filters.to }
          : undefined,
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: { user: { select: { id: true, email: true, role: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total };
  }
}