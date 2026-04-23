import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { ResponseService } from './response.service';

@Module({
  imports: [TemplatesModule],
  providers: [ResponseService],
  exports: [ResponseService],
})
export class ResponseModule {}
