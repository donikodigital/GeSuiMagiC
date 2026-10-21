//backend/src/anomalies/dto/update-anomaly-status.dto.ts
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AnomalyStatus } from '@prisma/client';

export class UpdateAnomalyStatusDto {
  @IsEnum(AnomalyStatus)
  status: AnomalyStatus;

  @IsOptional() @IsString() @MaxLength(2000)
  resolutionNote?: string;
}
