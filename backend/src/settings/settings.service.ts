//backend/src/settings/settings.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/exceptions/app.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UpsertSettingDto } from './dto/upsert-setting.dto';

/** Taille maximale (JSON serialise) d'une valeur de reglage : evite de stocker des documents arbitraires. */
const MAX_VALUE_BYTES = 10 * 1024;

function assertValueSize(value: unknown) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > MAX_VALUE_BYTES) {
    throw AppException.badRequest('SETTING_VALUE_INVALID', `La valeur du reglage est invalide ou depasse ${MAX_VALUE_BYTES / 1024} Ko.`);
  }
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async upsertGlobal(dto: UpsertSettingDto, actor: AuthenticatedUser) {
    assertValueSize(dto.value);

    // NB: le champ projectId etant nullable, Postgres traite chaque NULL comme
    // distinct dans l'index unique -> on ne peut pas s'appuyer sur upsert()
    // pour les reglages globaux. findFirst + create/update explicite, dans une
    // transaction pour que deux ecritures simultanees ne creent pas de doublon.
    return this.prisma.runInTransaction(async (tx) => {
      const existing = await tx.setting.findFirst({ where: { key: dto.key, projectId: null } });
      const setting = existing
        ? await tx.setting.update({ where: { id: existing.id }, data: { value: dto.value as Prisma.InputJsonValue, scope: 'GLOBAL' } })
        : await tx.setting.create({ data: { key: dto.key, value: dto.value as Prisma.InputJsonValue, scope: 'GLOBAL' } });

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Setting', entityId: setting.id, oldValue: existing?.value, newValue: dto },
        tx,
      );
      return setting;
    });
  }

  async listGlobal() {
    return this.prisma.setting.findMany({ where: { scope: 'GLOBAL' }, orderBy: { key: 'asc' } });
  }

  async upsertForProject(projectId: string, dto: UpsertSettingDto, actor: AuthenticatedUser) {
    assertValueSize(dto.value);

    return this.prisma.runInTransaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true } });
      if (!project) throw AppException.notFound('Projet');

      const existing = await tx.setting.findUnique({ where: { key_projectId: { key: dto.key, projectId } } });
      const setting = await tx.setting.upsert({
        where: { key_projectId: { key: dto.key, projectId } },
        update: { value: dto.value as Prisma.InputJsonValue, scope: 'PROJECT' },
        create: { key: dto.key, value: dto.value as Prisma.InputJsonValue, scope: 'PROJECT', projectId },
      });

      await this.audit.log(
        { userId: actor.userId, userRole: actor.role, action: 'UPDATE', entityType: 'Setting', entityId: setting.id, oldValue: existing?.value, newValue: dto },
        tx,
      );
      return setting;
    });
  }

  async listForProject(projectId: string) {
    return this.prisma.setting.findMany({ where: { projectId }, orderBy: { key: 'asc' } });
  }
}
