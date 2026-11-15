import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/jwt.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { PartiesModule } from './parties/parties.module.js';
import { ItemsModule } from './items/items.module.js';
import { RatesModule } from './rates/rates.module.js';
import { NotesModule } from './notes/notes.module.js';
import { RequestsModule } from './requests/requests.module.js';
import { MovementsModule } from './movements/movements.module.js';
import { ViewsModule } from './views/views.module.js';
import { RulesModule } from './rules/rules.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PartiesModule,
    ItemsModule,
    RatesModule,
    NotesModule,
    RequestsModule,
    MovementsModule,
    ViewsModule,
    RulesModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
