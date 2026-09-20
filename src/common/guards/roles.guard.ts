import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';

// Remplace AdminGuard : vérifie request.user contre le(s) rôle(s) minimum
// posé(s) via @Roles(...) sur la route. Hiérarchique (ORDER) — @Roles(moderator)
// laisse aussi passer un admin. Toujours une lecture DB fraîche (comme
// l'ancien AdminGuard) : un changement de rôle prend effet immédiatement,
// sans reconnexion ni nouveau token.
//
// Transition isAdmin -> role : un compte isAdmin=true (créé avant la RBAC)
// est traité comme admin même si role vaut encore "user" en base. Toute
// promotion/rétrogradation faite via PATCH /admin/users/:id/role met à jour
// isAdmin en même temps que role, donc ce filet de sécurité ne concerne que
// les comptes admin historiques jamais repassés par ce nouvel endpoint.
@Injectable()
  export class RolesGuard implements CanActivate {
  private static readonly ORDER: Role[] = [Role.user, Role.moderator, Role.admin];

constructor(
  private prisma: PrismaService,
  private reflector: Reflector,
  ) {}

async canActivate(context: ExecutionContext): Promise<boolean> {
  const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
    context.getHandler(),
    context.getClass(),
    ]);
  if (!required || required.length === 0) return true;

  const userId = context.switchToHttp().getRequest().user?.id;
  if (!userId) return false;

  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;

  const effectiveRole = user.isAdmin ? Role.admin : user.role;
  const minRequiredRank = Math.min(...required.map((r) => RolesGuard.ORDER.indexOf(r)));
  if (RolesGuard.ORDER.indexOf(effectiveRole) < minRequiredRank) {
    throw new ForbiddenException('Permissions insuffisantes pour cette action');
  }
  return true;
}
}
