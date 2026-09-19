import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMeDto } from './dto/update-me.dto';

const ME_SELECT = {
  id: true,
  phone: true,
  email: true,
  name: true,
  country: true,
  city: true,
  address: true,
  verified: true,
  isSeller: true,
  isAdmin: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async me(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: ME_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // PATCH /users/me - profile editing ("Mes informations" screen).
  // Phone is never editable here: it is the login identifier, any
  // number change must go through a dedicated re-verification flow
  // (out of scope for this MVP).
  async updateMe(id: string, dto: UpdateMeDto) {
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing && existing.id !== id) {
        throw new ConflictException('This email address is already used by another account.');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email,
        country: dto.country,
        city: dto.city,
        address: dto.address,
        isSeller: dto.isSeller,
      },
      select: ME_SELECT,
    });
  }

  // POST /users/bootstrap-admin - amorçage du tout premier compte admin, sans
  // avoir besoin d'un accès à la base de données ou à un tableau de bord tiers.
  // Ne fonctionne qu'une seule fois : dès qu'un admin existe déjà sur la
  // plateforme, cette route redevient définitivement inopérante (403).
  async bootstrapAdmin(id: string) {
    const existingAdmin = await this.prisma.user.findFirst({ where: { isAdmin: true } });
    if (existingAdmin) {
      throw new ForbiddenException('Un compte administrateur existe déjà sur cette plateforme.');
    }

    return this.prisma.user.update({
      where: { id },
      data: { isAdmin: true },
      select: ME_SELECT,
    });
  }
}
