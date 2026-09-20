import { IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class SetRoleDto {
  @IsEnum(Role)
  role!: Role;
}
