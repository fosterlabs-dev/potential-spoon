import { Global, Module } from '@nestjs/common';
import { ComposerService } from './composer.service';

@Global()
@Module({
  providers: [ComposerService],
  exports: [ComposerService],
})
export class ComposerModule {}
