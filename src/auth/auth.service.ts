import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private otp: OtpService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  // POST /auth/otp/request — section 4 : inscription/connexion par téléphone + SMS.
  async requestOtp(phone: string): Promise<{ sent: true; expiresInSeconds: number }> {
    const code = this.otp.generateCode();
    const expiresAt = new Date(Date.now() + this.otp.ttl * 1000);

    await this.prisma.otpCode.create({
      data: { phone, code, expiresAt },
    });

    await this.otp.sendCode(phone, code);
    return { sent: true, expiresInSeconds: this.otp.ttl };
  }

  // POST /auth/otp/verify — vérifie le code, crée le compte au premier passage,
  // renvoie une paire access/refresh token.
  async verifyOtp(phone: string, code: string, name?: string): Promise<TokenPair & { userId: string }> {
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: { phone, code, consumed: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('Code invalide ou expiré');
    }

    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { consumed: true },
    });

    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { phone, name: name?.trim() || 'Nouvel utilisateur', verified: true },
      });
    }

    const tokens = await this.issueTokens(user.id, user.phone);
    return { ...tokens, userId: user.id };
  }

  // POST /auth/refresh — le refresh token est stocké haché côté serveur pour
  // pouvoir être révoqué (déconnexion à distance, compte suspendu — section 4).
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; phone: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: this.config.get('JWT_REFRESH_SECRET') });
    } catch {
      throw new UnauthorizedException('Refresh token invalide');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash, revoked: false, expiresAt: { gt: new Date() } },
    });
    if (!stored) {
      throw new UnauthorizedException('Refresh token révoqué ou expiré');
    }

    // Rotation : on révoque l'ancien et on en émet un nouveau.
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
    return this.issueTokens(payload.sub, payload.phone);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });
  }

  private async issueTokens(userId: string, phone: string): Promise<TokenPair> {
    const payload = { sub: userId, phone };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN'),
    });
    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN'),
    });

    const expiresAt = new Date(Date.now() + this.parseDurationMs(this.config.get('JWT_REFRESH_EXPIRES_IN') ?? '30d'));
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hashToken(refreshToken), expiresAt },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseDurationMs(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration.trim());
    if (!match) return 30 * 24 * 3600 * 1000;
    const value = Number(match[1]);
    const unit = match[2];
    const unitMs: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return value * unitMs[unit];
  }
}
