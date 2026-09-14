import { ConfigService } from '@nestjs/config';

// ConfigService factice : lit dans un objet en mémoire au lieu d'un vrai .env.
export function createConfigMock(values: Record<string, string | number> = {}): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}
