import { Global, Module } from '@nestjs/common';
import { FragmentsService } from './fragments.service';

@Global()
@Module({
  providers: [FragmentsService],
  exports: [FragmentsService],
})
export class FragmentsModule {}
