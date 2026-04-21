import { Global, Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';

@Global()
@Module({
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
