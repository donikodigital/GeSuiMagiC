//backend/src/attachments/attachments.controller.ts - v1.1
// Fix securite : findFor() n'avait aucune verification d'acces - un client
// ou superviseur pouvait consulter les pieces jointes de n'importe quel
// projet en changeant projectId/depositId/expenseId dans l'URL. Meme
// logique d'isolation multi-tenant que ProjectsService.assignSupervisor et
// SupervisorsService.findOne (superadmin bypass, client/superviseur verifies
// contre le projet parent).

import { Body, Controller, Delete, Get, Injectable, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { AppException } from '../common/exceptions/app.exception';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { CreateAttachmentDto } from './dto/create-attachment.dto';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  async presign(dto: PresignUploadDto) {
    if (!ALLOWED_MIME_TYPES.includes(dto.mimeType)) {
      throw AppException.badRequest('UNSUPPORTED_FILE_TYPE', 'Formats acceptes : JPG, JPEG, PNG, PDF.');
    }
    return this.storage.createPresignedUploadUrl(dto.fileName, dto.mimeType, dto.kind);
  }

  async create(dto: CreateAttachmentDto, actor: AuthenticatedUser) {
    if (!ALLOWED_MIME_TYPES.includes(dto.mimeType)) {
      throw AppException.badRequest('UNSUPPORTED_FILE_TYPE', 'Formats acceptes : JPG, JPEG, PNG, PDF.');
    }
    const maxBytes = this.config.get<number>('storage.maxFileSizeMb')! * 1024 * 1024;
    if (dto.fileSizeBytes > maxBytes) {
      throw AppException.badRequest('FILE_TOO_LARGE', `Le fichier depasse la taille maximale autorisee (${this.config.get('storage.maxFileSizeMb')} Mo).`);
    }
    if (!dto.projectId && !dto.depositId && !dto.expenseId) {
      throw AppException.badRequest('ATTACHMENT_TARGET_REQUIRED', 'Un justificatif doit etre rattache a un projet, un depot ou une depense.');
    }

    // Meme isolation que la lecture : on ne peut attacher un fichier qu'a une cible que l'on peut soi-meme consulter.
    await this.assertAccess(dto, actor);

    const attachment = await this.prisma.attachment.create({
      data: {
        fileName: dto.fileName,
        fileUrl: dto.fileUrl,
        mimeType: dto.mimeType,
        fileSizeBytes: dto.fileSizeBytes,
        kind: dto.kind,
        projectId: dto.projectId,
        depositId: dto.depositId,
        expenseId: dto.expenseId,
        uploadedById: actor.userId,
      },
    });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'CREATE',
      entityType: 'Attachment',
      entityId: attachment.id,
      newValue: { fileName: dto.fileName, kind: dto.kind, projectId: dto.projectId, depositId: dto.depositId, expenseId: dto.expenseId },
    });

    return attachment;
  }

  async findFor(filters: { projectId?: string; depositId?: string; expenseId?: string }, actor: AuthenticatedUser) {
    await this.assertAccess(filters, actor);
    return this.prisma.attachment.findMany({ where: filters, orderBy: { createdAt: 'desc' } });
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: { deposit: true, expense: true },
    });
    if (!attachment) throw AppException.notFound('Piece jointe');

    // Un justificatif rattache a une operation verrouillee ne peut plus etre retire (integrite de l'audit).
    if (attachment.deposit?.isLocked || attachment.expense?.isLocked) {
      if (actor.role !== 'SUPERADMIN') {
        throw AppException.locked('Cette piece jointe');
      }
    }

    if (actor.role !== 'SUPERADMIN' && attachment.uploadedById !== actor.userId) {
      throw AppException.forbiddenProjectAccess();
    }

    await this.prisma.attachment.delete({ where: { id } });
    await this.storage.deleteByUrl(attachment.fileUrl);

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'DELETE_SOFT',
      entityType: 'Attachment',
      entityId: id,
      oldValue: { fileName: attachment.fileName },
    });

    return { removed: true };
  }

  /**
   * Verifie que l'acteur a le droit de voir/attacher un fichier sur cette cible.
   * Resout projectId a partir de depositId/expenseId si necessaire, puis
   * verifie l'appartenance du projet au client, ou l'affectation active du
   * superviseur - meme logique d'isolation que le reste de l'app.
   */
  private async assertAccess(filters: { projectId?: string; depositId?: string; expenseId?: string }, actor: AuthenticatedUser) {
    if (actor.role === 'SUPERADMIN') return;

    let projectId = filters.projectId;
    if (!projectId && filters.depositId) {
      const deposit = await this.prisma.deposit.findUnique({ where: { id: filters.depositId }, select: { projectId: true } });
      projectId = deposit?.projectId;
    }
    if (!projectId && filters.expenseId) {
      const expense = await this.prisma.expense.findUnique({ where: { id: filters.expenseId }, select: { projectId: true } });
      projectId = expense?.projectId;
    }
    if (!projectId) {
      throw AppException.badRequest('ATTACHMENT_TARGET_REQUIRED', 'Un projet, un depot ou une depense valide est requis.');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        clientId: true,
        supervisors: { where: { status: 'ACTIVE' }, select: { supervisorId: true } },
      },
    });
    if (!project) throw AppException.notFound('Projet');

    const allowed =
      (actor.role === 'CLIENT' && project.clientId === actor.clientProfileId) ||
      (actor.role === 'SUPERVISOR' && project.supervisors.some((s) => s.supervisorId === actor.supervisorProfileId));

    if (!allowed) throw AppException.forbiddenProjectAccess();
  }
}

@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('presign')
  async presign(@Body() dto: PresignUploadDto) {
    return this.attachmentsService.presign(dto);
  }

  @Post()
  async create(@Body() dto: CreateAttachmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.attachmentsService.create(dto, actor);
  }

  @Get()
  async findFor(
    @Query('projectId') projectId: string | undefined,
    @Query('depositId') depositId: string | undefined,
    @Query('expenseId') expenseId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachmentsService.findFor({ projectId, depositId, expenseId }, actor);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.attachmentsService.remove(id, actor);
  }
}