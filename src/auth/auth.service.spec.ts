import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { createPrismaMock } from '../../test/mocks/prisma.mock';
import { createConfigMock } from '../../test/mocks/config.mock';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let prisma: PrismaService;
  let otp: jest.Mocked<Pick<OtpService, 'generateCode' | 'sendCode' | 'ttl'>>;
  let jwt: jest.Mocked<Pick<JwtService, 'sign' | 'verify'>>;
  let service: AuthService;

  beforeEach(() => {
    prisma = createPrismaMock();
    otp = {
      generateCode: jest.fn().mockReturnValue('123456'),
      sendCode: jest.fn().mockResolvedValue(undefined),
      ttl: 300,
    };
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token'), verify: jest.fn() };
    const config = createConfigMock({
      JWT_ACCESS_SECRET: 'access-secret',
      JWT_ACCESS_EXPIRES_IN: '1h',
      JWT_REFRESH_SECRET: 'refresh-secret',
      JWT_REFRESH_EXPIRES_IN: '30d',
    });
    service = new AuthService(prisma, otp as unknown as OtpService, jwt as unknown as JwtService, config);
  });

  describe('requestOtp', () => {
    it('génère un code, le stocke et l’envoie par SMS', async () => {
      (prisma as any).otpCode.create.mockResolvedValue({});

      const result = await service.requestOtp('+225 07 00 00 00 00');

      expect((prisma as any).otpCode.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ phone: '+225 07 00 00 00 00', code: '123456' }) }),
      );
      expect(otp.sendCode).toHaveBeenCalledWith('+225 07 00 00 00 00', '123456');
      expect(result).toEqual({ sent: true, expiresInSeconds: 300 });
    });
  });

  describe('verifyOtp', () => {
    it('refuse un code invalide ou expiré', async () => {
      (prisma as any).otpCode.findFirst.mockResolvedValue(null);

      await expect(service.verifyOtp('+225 07 00 00 00 00', '000000')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('crée un nouveau compte au premier passage et renvoie les jetons', async () => {
      (prisma as any).otpCode.findFirst.mockResolvedValue({ id: 'otp-1' });
      (prisma as any).otpCode.update.mockResolvedValue({});
      (prisma as any).user.findUnique.mockResolvedValue(null);
      (prisma as any).user.create.mockResolvedValue({ id: 'user-1', phone: '+225 07 00 00 00 00' });
      (prisma as any).refreshToken.create.mockResolvedValue({});

      const result = await service.verifyOtp('+225 07 00 00 00 00', '123456', 'Awa Koné');

      expect((prisma as any).user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Awa Koné', verified: true }) }),
      );
      expect(result.userId).toBe('user-1');
      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('ne recrée pas de compte si le téléphone existe déjà', async () => {
      (prisma as any).otpCode.findFirst.mockResolvedValue({ id: 'otp-1' });
      (prisma as any).otpCode.update.mockResolvedValue({});
      (prisma as any).user.findUnique.mockResolvedValue({ id: 'user-existant', phone: '+225 07 00 00 00 00' });
      (prisma as any).refreshToken.create.mockResolvedValue({});

      await service.verifyOtp('+225 07 00 00 00 00', '123456');

      expect((prisma as any).user.create).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('refuse un refresh token dont la signature JWT est invalide', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(service.refresh('token-invalide')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('refuse un refresh token révoqué même si sa signature JWT est valide', async () => {
      jwt.verify.mockReturnValue({ sub: 'user-1', phone: '+225 07 00 00 00 00' } as any);
      (prisma as any).refreshToken.findFirst.mockResolvedValue(null); // révoqué / expiré / inconnu en base

      await expect(service.refresh('token-revoque')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
