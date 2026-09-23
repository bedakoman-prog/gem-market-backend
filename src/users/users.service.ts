import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getSellerRatings } from '../common/ratings/seller-ratings';
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
  role: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async me(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: ME_SELECT });
    if (!user) throw new NotFoundException('User not found');
    // Note moyenne + nombre d'avis (section "avis clients sur le vendeur") —
    // exposés aussi sur son propre profil, pas seulement sur ses annonces.
    const ratings = await getSellerRatings(this.prisma, [id]);
    return { ...user, ...(ratings.get(id) ?? { rating: null, ratingsCount: 0 }) };
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
}
