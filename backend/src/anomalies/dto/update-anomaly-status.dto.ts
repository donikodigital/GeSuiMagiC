import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AnomalyStatus } from '@prisma/client';

export class UpdateAnomalyStatusDto {
  @IsEnum(AnomalyStatus)
  status: AnomalyStatus;

  @IsOptional() @IsString()
  resolutionNote?: string;
}
