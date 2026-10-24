//backend/src/attachments/attachments.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Attachment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { AppException } from '../common/exceptions/app.exception';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { projectAccessFilter } from '../common/utils/project-access.util';
import { AttachmentEntityType } from './attachment.constants';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { CreateAttachmentDto } from './dto/create-attachment.dto';

export interface AttachmentTarget {
  projectId?: string;
  depositId?: string;
  expenseId?: string;
  entityType?: string;
  entityId?: string;
}

/** Nombre maximal de pieces jointes renvoyees pour une liste non filtree (superadmin). */
const MAX_LIST_SIZE = 200;

/** Retire les caracteres de controle et les separateurs de chemin d'un nom de fichier fourni par le client. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]+/g, '_')
    .trim();
  return (cleaned || 'fichier').slice(0, 255);
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  /** Dossier de stockage de l'acteur : son client (locataire) ou "admin". */
  private scopeOf(actor: AuthenticatedUser): string {
    return actor.tenantClientId ?? 'admin';
  }

  async presign(dto: PresignUploadDto, actor: AuthenticatedUser) {
    return this.storage.createPresignedUploadUrl(this.scopeOf(actor), dto.mimeType, dto.kind);
  }

  async create(dto: CreateAttachmentDto, actor: AuthenticatedUser) {
    if (!dto.projectId && !dto.depositId && !dto.expenseId) {
      throw AppException.badRequest('ATTACHMENT_TARGET_REQUIRED', 'Un justificatif doit être rattaché à un projet, un dépôt ou une dépense.');
    }
    if (!!dto.entityType !== !!dto.entityId) {
      throw AppException.badRequest('ATTACHMENT_ENTITY_INCOMPLETE', "entityType et entityId doivent être fournis ensemble.");
    }

    // Meme isolation que la lecture : on ne peut attacher un fichier qu'a une cible que l'on peut soi-meme consulter.
    // Toutes les cibles fournies (projet, depot, depense) doivent appartenir au MEME projet.
    await this.resolveTarget(dto, actor, true);

    // Le fichier doit avoir ete televerse via NOTRE presign, dans le dossier de l'acteur, avec la bonne categorie.
    const key = this.storage.keyFromFileUrl(dto.fileUrl);
    if (!key || !key.startsWith(`${this.scopeOf(actor)}/${dto.kind}/`)) {
      throw AppException.badRequest('INVALID_FILE_URL', "L'adresse du fichier est invalide.");
    }
    const fileUrl = this.storage.fileUrlForKey(key);

    let capturedAt: Date | undefined;
    if (dto.capturedAt) {
      capturedAt = new Date(dto.capturedAt);
      // Tolerance de 5 minutes pour les horloges d'appareils legerement en avance.
      if (Number.isNaN(capturedAt.getTime()) || capturedAt.getTime() > Date.now() + 5 * 60 * 1000) {
        throw AppException.badRequest('INVALID_CAPTURED_AT', "La date de prise de vue ne peut pas être dans le futur.");
      }
    }

    const alreadyUsed = await this.prisma.attachment.findFirst({ where: { fileUrl }, select: { id: true } });
    if (alreadyUsed) throw AppException.conflict('FILE_ALREADY_REGISTERED', 'Ce fichier est deja enregistre.');

    // Taille et type reels (et non ceux declares par le navigateur).
    const maxBytes = this.config.get<number>('storage.maxFileSizeMb')! * 1024 * 1024;
    const { sizeBytes } = await this.storage.verifyUploadedObject(key, dto.mimeType, maxBytes);

    const attachment = await this.prisma.attachment.create({
      data: {
        fileName: sanitizeFileName(dto.fileName),
        fileUrl,
        mimeType: dto.mimeType === 'image/jpg' ? 'image/jpeg' : dto.mimeType,
        fileSizeBytes: sizeBytes,
        kind: dto.kind,
        projectId: dto.projectId,
        depositId: dto.depositId,
        expenseId: dto.expenseId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        capturedAt,
        uploadedById: actor.userId,
      },
    });

    await this.audit.log({
      userId: actor.userId,
      userRole: actor.role,
      action: 'CREATE',
      entityType: 'Attachment',
      entityId: attachment.id,
      newValue: { fileName: attachment.fileName, kind: dto.kind, projectId: dto.projectId, depositId: dto.depositId, expenseId: dto.expenseId, entityType: dto.entityType, entityId: dto.entityId },
    });

    return this.withReadUrl(attachment);
  }

  async findFor(filters: AttachmentTarget, actor: AuthenticatedUser) {
    // Un non-superadmin DOIT cibler une ressource qu'il peut consulter (jamais de liste globale).
    await this.resolveTarget(filters, actor, actor.role !== 'SUPERADMIN');

    const attachments = await this.prisma.attachment.findMany({
      where: { projectId: filters.projectId, depositId: filters.depositId, expenseId: filters.expenseId, entityType: filters.entityType, entityId: filters.entityId },
      orderBy: { createdAt: 'desc' },
      take: MAX_LIST_SIZE,
    });
    return Promise.all(attachments.map((a) => this.withReadUrl(a)));
  }

  /**
   * Pieces jointes de plusieurs objets du chantier d'un meme type (photos d'un journal, bons de livraison...).
   * Pas de controle d'acces ici : l'appelant a deja verifie l'acces aux objets (donc au projet).
   */
  async listForEntities(entityType: AttachmentEntityType, entityIds: string[]) {
    const byEntity = new Map<string, Array<Pick<Attachment, 'id' | 'fileName' | 'fileUrl' | 'mimeType' | 'kind' | 'capturedAt' | 'createdAt'> & { entityId: string }>>();
    if (entityIds.length === 0) return byEntity;

    const rows = await this.prisma.attachment.findMany({
      where: { entityType, entityId: { in: entityIds } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, fileName: true, fileUrl: true, mimeType: true, kind: true, capturedAt: true, createdAt: true, entityId: true },
    });
    for (const row of rows) {
      const view = await this.withReadUrl({ ...row, entityId: row.entityId! });
      const list = byEntity.get(view.entityId) ?? [];
      list.push(view);
      byEntity.set(view.entityId, list);
    }
    return byEntity;
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: { deposit: true, expense: true },
    });
    if (!attachment) throw AppException.notFound('Pièce jointe');

    if (actor.role !== 'SUPERADMIN') {
      // Il faut (1) toujours avoir acces au projet concerne (un superviseur revoque ne peut plus rien supprimer),
      // (2) etre l'auteur du televersement, (3) que l'operation ne soit pas verrouillee.
      await this.resolveTarget(
        { projectId: attachment.projectId ?? undefined, depositId: attachment.depositId ?? undefined, expenseId: attachment.expenseId ?? undefined },
        actor,
        true,
      );
      if (attachment.uploadedById !== actor.userId) throw AppException.forbiddenProjectAccess();
      // Un justificatif rattache a une operation verrouillee ne peut plus etre retire (integrite de l'audit).
      if (attachment.deposit?.isLocked || attachment.expense?.isLocked) throw AppException.locked('Cette pièce jointe');
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

  /** Remplace fileUrl par une URL signee de courte duree quand le bucket est prive. */
  private async withReadUrl<T extends Pick<Attachment, 'fileUrl'>>(attachment: T): Promise<T> {
    return { ...attachment, fileUrl: await this.storage.resolveReadUrl(attachment.fileUrl) };
  }

  /**
   * Resout et controle la cible d'une piece jointe.
   *  - toutes les cibles fournies (projet / depot / depense) doivent exister et appartenir au meme projet
   *    (avant, seul projectId etait controle : on pouvait fournir SON projet avec le depotId d'un autre) ;
   *  - l'acteur doit avoir acces a ce projet (superadmin : tout ; client : ses projets ; superviseur : affectation active).
   * Renvoie le projectId resolu (undefined si aucune cible et non requise).
   */
  private async resolveTarget(target: AttachmentTarget, actor: AuthenticatedUser, requireTarget: boolean): Promise<string | undefined> {
    const isAdmin = actor.role === 'SUPERADMIN';
    // Pour un non-admin, on ne revele pas si une ressource inexistante ou hors perimetre.
    const missing = (entity: string) => (isAdmin ? AppException.notFound(entity) : AppException.forbiddenProjectAccess());

    const projectIds = new Set<string>();
    if (target.projectId) projectIds.add(target.projectId);
    if (target.depositId) {
      const deposit = await this.prisma.deposit.findUnique({ where: { id: target.depositId }, select: { projectId: true } });
      if (!deposit) throw missing('Dépôt');
      projectIds.add(deposit.projectId);
    }
    if (target.expenseId) {
      const expense = await this.prisma.expense.findUnique({ where: { id: target.expenseId }, select: { projectId: true } });
      if (!expense) throw missing('Dépense');
      projectIds.add(expense.projectId);
    }

    if (target.entityType && target.entityId) {
      // Un objet du chantier doit etre designe avec SON projet : le controle d'acces repose sur ce projet.
      if (!target.projectId) {
        throw AppException.badRequest('ATTACHMENT_TARGET_REQUIRED', 'Le projet est requis pour rattacher un fichier à cet élément.');
      }
      const owner = await this.entityProjectId(target.entityType, target.entityId);
      if (!owner) throw missing('Élément');
      projectIds.add(owner);
    }

    if (projectIds.size === 0) {
      if (requireTarget) {
        throw AppException.badRequest('ATTACHMENT_TARGET_REQUIRED', 'Un projet, un dépôt ou une dépense valide est requis.');
      }
      return undefined;
    }
    if (projectIds.size > 1) {
      throw AppException.badRequest('ATTACHMENT_TARGET_MISMATCH', 'Le projet, le dépôt et la dépense indiqués ne correspondent pas au même projet.');
    }

    const [projectId] = [...projectIds];
    const project = await this.prisma.project.findFirst({
      where: { AND: [{ id: projectId }, projectAccessFilter(actor)] },
      select: { id: true },
    });
    if (!project) throw missing('Projet');
    return projectId;
  }

  /** Projet auquel appartient un objet du chantier (null s'il n'existe pas). */
  private async entityProjectId(entityType: string, entityId: string): Promise<string | null> {
    const where = { where: { id: entityId } };
    switch (entityType as AttachmentEntityType) {
      case 'SiteLog':
        return (await this.prisma.siteLog.findUnique({ ...where, select: { projectId: true } }))?.projectId ?? null;
      case 'Snag':
        return (await this.prisma.snag.findUnique({ ...where, select: { projectId: true } }))?.projectId ?? null;
      case 'Reception':
        return (await this.prisma.reception.findUnique({ ...where, select: { projectId: true } }))?.projectId ?? null;
      case 'ChangeOrder':
        return (await this.prisma.changeOrder.findUnique({ ...where, select: { projectId: true } }))?.projectId ?? null;
      case 'SupplierQuote':
        return (await this.prisma.supplierQuote.findUnique({ ...where, select: { lot: { select: { projectId: true } } } }))?.lot.projectId ?? null;
      case 'Contract':
        return (await this.prisma.contract.findUnique({ ...where, select: { projectId: true } }))?.projectId ?? null;
      case 'ProgressStatement':
        return (await this.prisma.progressStatement.findUnique({ ...where, select: { projectId: true } }))?.projectId ?? null;
      case 'ContractPayment':
        return (await this.prisma.contractPayment.findUnique({ ...where, select: { projectId: true } }))?.projectId ?? null;
      case 'Delivery':
        return (await this.prisma.delivery.findUnique({ ...where, select: { projectId: true } }))?.projectId ?? null;
      case 'StockMovement':
        return (await this.prisma.stockMovement.findUnique({ ...where, select: { projectId: true } }))?.projectId ?? null;
      case 'ProjectDocument':
        return (await this.prisma.projectDocument.findUnique({ ...where, select: { projectId: true } }))?.projectId ?? null;
      case 'PhaseProgressUpdate':
        return (await this.prisma.phaseProgressUpdate.findUnique({ ...where, select: { projectId: true } }))?.projectId ?? null;
      case 'PurchaseOrder':
        return (await this.prisma.purchaseOrder.findUnique({ ...where, select: { projectId: true } }))?.projectId ?? null;
      default:
        return null;
    }
  }
}
