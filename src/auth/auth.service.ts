import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';

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
        // `verified` reste à false par défaut (voir register() plus haut) :
        // avoir confirmé son numéro par OTP ne prouve pas que la boutique est
        // réelle, seule une vérification par un modérateur le fait.
        data: { phone, name: name?.trim() || 'Nouvel utilisateur' },
      });
    }
    this.assertNotSuspended(user);

    const tokens = await this.issueTokens(user.id, user.phone);
    return { ...tokens, userId: user.id };
  }

  // POST /auth/register — inscription complète (email + mot de passe + identité
  // + pays/ville/adresse), en plus du téléphone. Remplace la dépendance à l'OTP
  // SMS pour l'inscription : aucun fournisseur SMS réel n'est branché en Phase 0
  // (voir otp.service.ts), donc le code n'arrivait jamais aux utilisateurs.
  async register(dto: RegisterDto): Promise<TokenPair & { userId: string }> {
    const [existingEmail, existingPhone] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email } }),
      this.prisma.user.findUnique({ where: { phone: dto.phone } }),
    ]);
    if (existingEmail) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }
    if (existingPhone) {
      throw new ConflictException('Un compte existe déjà avec ce numéro de téléphone');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        email: dto.email,
        passwordHash,
        name: dto.name,
        country: dto.country,
        city: dto.city,
        address: dto.address,
        // `verified` n'est plus mis à true automatiquement ici : ce badge
        // doit uniquement refléter qu'un modérateur a vérifié l'existence
        // réelle de la boutique/annonce (voir AdminService.verifySeller),
        // pas le simple fait de s'être inscrit.
      },
    });

    const tokens = await this.issueTokens(user.id, user.phone);
    return { ...tokens, userId: user.id };
  }

  // POST /auth/login — connexion par email + mot de passe.
  async login(dto: LoginDto): Promise<TokenPair & { userId: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }
    this.assertNotSuspended(user);

    const tokens = await this.issueTokens(user.id, user.phone);
    return { ...tokens, userId: user.id };
  }

  // POST /auth/reset-password — "mot de passe oublié". Aucun fournisseur
  // d'e-mail réel n'est branché en Phase 0 (comme pour les SMS, voir
  // otp.service.ts), donc on ne peut pas envoyer de lien de réinitialisation.
  // À la place, l'identité est confirmée par la combinaison téléphone + email
  // fournie à l'inscription (les deux sont obligatoires sur /auth/register),
  // ce qui reste raisonnable pour ce MVP. Toutes les sessions existantes sont
  // révoquées par sécurité une fois le mot de passe changé.
  // POST /auth/reset-password/request — étape 1/2. Corrige la faille où
  // phone+email seuls permettaient à n'importe qui de réinitialiser le mot de
  // passe de n'importe quel compte (aucune preuve que le demandeur est bien le
  // titulaire). On ne révèle jamais si le compte existe ou non dans la
  // réponse (message identique dans les deux cas) pour éviter d'énumérer les
  // comptes enregistrés ; seul le titulaire, qui reçoit le code sur SON
  // téléphone, peut passer à l'étape 2.
  async requestPasswordReset(dto: RequestPasswordResetDto): Promise<{ sent: true; expiresInSeconds: number }> {
    const user = await this.prisma.user.findFirst({ where: { phone: dto.phone, email: dto.email } });
    if (user) {
      this.assertNotSuspended(user);
      const code = this.otp.generateCode();
      const expiresAt = new Date(Date.now() + this.otp.ttl * 1000);
      await this.prisma.otpCode.create({ data: { phone: dto.phone, code, expiresAt, userId: user.id } });
      await this.otp.sendCode(dto.phone, code);
    }
    // Réponse identique que le compte existe ou non — évite de laisser un
    // attaquant vérifier quelles paires phone+email sont inscrites.
    return { sent: true, expiresInSeconds: this.otp.ttl };
  }

  // POST /auth/reset-password/confirm — étape 2/2. Exige le code OTP envoyé
  // à l'étape 1 en plus de phone+email+nouveau mot de passe.
  async confirmPasswordReset(dto: ResetPasswordDto): Promise<TokenPair & { userId: string }> {
    const user = await this.prisma.user.findFirst({ where: { phone: dto.phone, email: dto.email } });
    if (!user) {
      throw new BadRequestException("Aucun compte ne correspond à ce numéro de téléphone et cet email.");
    }
    this.assertNotSuspended(user);

    const otpRecord = await this.prisma.otpCode.findFirst({
      where: { phone: dto.phone, code: dto.code, consumed: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otpRecord) {
      throw new BadRequestException('Code invalide ou expiré.');
    }
    await this.prisma.otpCode.update({ where: { id: otpRecord.id }, data: { consumed: true } });

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await this.revokeAllForUser(user.id);

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

  // Bloque toute émission de token (OTP, login, reset) pour un compte
  // suspendu (voir AdminService.suspendUser). refresh() est déjà couvert
  // séparément : la suspension révoque les refresh tokens existants.
  private assertNotSuspended(user: { suspended: boolean; suspendedReason: string | null }): void {
    if (user.suspended) {
      throw new UnauthorizedException(
        user.suspendedReason ? `Compte suspendu : ${user.suspendedReason}` : 'Compte suspendu',
      );
    }
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
