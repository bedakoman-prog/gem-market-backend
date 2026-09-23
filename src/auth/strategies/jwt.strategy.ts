import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string; // user id
  phone: string;
}

export interface AuthenticatedUser {
  id: string;
  phone: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  // Ce que retourne validate() devient request.user (voir CurrentUser decorator).
  // Lecture DB à chaque requête (comme RolesGuard) : un compte suspendu perd
  // l'accès immédiatement, sans attendre l'expiration de l'access token
  // (jusqu'à JWT_ACCESS_EXPIRES_IN) — les refresh tokens sont eux révoqués
  // dès la suspension (voir AdminService.suspendUser).
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, phone: true, suspended: true, suspendedReason: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.suspended) {
      throw new UnauthorizedException(
        user.suspendedReason ? `Compte suspendu : ${user.suspendedReason}` : 'Compte suspendu',
      );
    }
    return { id: user.id, phone: user.phone };
  }
}
