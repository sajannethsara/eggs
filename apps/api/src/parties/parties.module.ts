import { Module } from '@nestjs/common';
import { PartiesController } from './parties.controller.js';
import { PartiesService } from './parties.service.js';
import { ViewsModule } from '../views/views.module.js';

@Module({
  imports: [ViewsModule],
  controllers: [PartiesController],
  providers: [PartiesService],
  exports: [PartiesService],
})
export class PartiesModule {}
