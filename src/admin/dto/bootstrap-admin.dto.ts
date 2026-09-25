import { IsEmail } from 'class-validator';

export class BootstrapAdminDto {
  @IsEmail()
  email!: string;
}
