//backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { SupervisorsModule } from './supervisors/supervisors.module';
import { ProjectsModule } from './projects/projects.module';
import { WalletsModule } from './wallets/wallets.module';
import { DepositsModule } from './deposits/deposits.module';
import { ExpensesModule } from './expenses/expenses.module';
import { CategoriesModule } from './categories/categories.module';
import { MaterialsModule } from './materials/materials.module';
import { UnitsModule } from './units/units.module';
import { BudgetsModule } from './budgets/budgets.module';
import { StorageModule } from './storage/storage.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { AnomaliesModule } from './anomalies/anomalies.module';
import { SettingsModule } from './settings/settings.module';
import { ReportsModule } from './reports/reports.module';
import { MessagesModule } from './messages/messages.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnv }),
    // Les valeurs THROTTLE_TTL (secondes) / THROTTLE_LIMIT du .env etaient
    // ignorees (60 s / 100 requetes codes en dur) : elles sont maintenant lues.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: config.get<number>('throttle.ttl')! * 1000, limit: config.get<number>('throttle.limit')! }],
      }),
    }),
    PrismaModule,

    AuditModule,
    NotificationsModule,
    AuthModule,
    ClientsModule,
    SupervisorsModule,
    ProjectsModule,
    WalletsModule,
    DepositsModule,
    ExpensesModule,
    CategoriesModule,
    MaterialsModule,
    UnitsModule,
    BudgetsModule,
    StorageModule,
    AttachmentsModule,
    AnomaliesModule,
    SettingsModule,
    ReportsModule,
    MessagesModule,
  ],
  providers: [
    // Ordre d'execution : Throttler -> JwtAuth (peuple request.user) -> Roles (RBAC sur request.user.role)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformResponseInterceptor },
  ],
})
export class AppModule {}
