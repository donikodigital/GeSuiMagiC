//backend/src/common/guards/project-access.guard.ts
import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../exceptions/app.exception';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { projectAccessFilter } from '../utils/project-access.util';

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
 *
 * "Fail-closed" : si le profil de l'utilisateur est absent, la requete est
 * refusee. Avant, un identifiant `undefined` etait passe a Prisma, qui
 * l'interprete comme "pas de filtre" (et non "aucun resultat") : le controle
 * devenait alors permissif au lieu de refuser l'acces.
 */
@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;
    if (!user) throw AppException.forbiddenProjectAccess();

    // Le superadmin a une visibilite globale (lecture/administration - section 4.1)
    if (user.role === 'SUPERADMIN') return true;

    const paramName =
      this.reflector.getAllAndOverride<string>(PROJECT_PARAM_KEY, [context.getHandler(), context.getClass()]) || 'projectId';
    const projectId = request.params?.[paramName];
    if (!projectId || typeof projectId !== 'string') throw AppException.forbiddenProjectAccess();

    // Lance une exception si le profil client/superviseur manque (fail-closed).
    const scope = projectAccessFilter(user);

    const project = await this.prisma.project.findFirst({
      where: { AND: [{ id: projectId }, scope] },
      select: { id: true },
    });
    if (!project) throw AppException.forbiddenProjectAccess();
    return true;
  }
}
