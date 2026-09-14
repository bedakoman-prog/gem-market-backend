import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global() : PrismaService est injecté dans quasiment tous les modules ;
// pas besoin de ré-importer PrismaModule partout.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
