import { Global, Module } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';

@Global()
@Module({
  providers: [KnowledgeBaseService],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
