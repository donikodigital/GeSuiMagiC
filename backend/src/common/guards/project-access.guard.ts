import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../exceptions/app.exception';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

export const PROJECT_PARAM_KEY = 'projectParamName';

/**
 * Precise le nom du parametre de route contenant le projectId quand il n'est
 * pas `:projectId` par defaut (ex: routes montees sous /projects/:id).
 */
export const ProjectParam = (paramName: string) => SetMetadata(PROJECT_PARAM_KEY, paramName);

/**
 * Regle de securite multi-tenant fondamentale (section 77) :
 *   Utilisateur -> Client/Superviseur -> Projet -> Ressource
 * Il ne suffit JAMAIS de verifier seulement `userId`. On verifie ici
 * explicitement l'appartenance au projet avant de laisser passer la requete,
 * quelle que soit la maniere dont l'URL a ete construite/modifiee cote client.
 */
@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;
    if (!user) throw AppException.forbiddenProjectAccess();

    // Le superadmin a une visibilite globale (lecture/administration - section 4.1)
    if (user.role === 'SUPERADMIN') return true;

    const paramName =
      this.reflector.getAllAndOverride<string>(PROJECT_PARAM_KEY, [context.getHandler(), context.getClass()]) || 'projectId';
    const projectId = request.params?.[paramName];
    if (!projectId) throw AppException.forbiddenProjectAccess();

    if (user.role === 'CLIENT') {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, clientId: user.clientProfileId },
        select: { id: true },
      });
      if (!project) throw AppException.forbiddenProjectAccess();
      return true;
    }

    if (user.role === 'SUPERVISOR') {
      const assignment = await this.prisma.projectSupervisor.findFirst({
        where: { projectId, supervisorId: user.supervisorProfileId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!assignment) throw AppException.forbiddenProjectAccess();
      return true;
    }

    throw AppException.forbiddenProjectAccess();
  }
}
