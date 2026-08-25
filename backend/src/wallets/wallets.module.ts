//backend/src/wallets/wallets.module.ts
import { Module } from '@nestjs/common';
import { WalletsService } from './wallets.service';

@Module({
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
