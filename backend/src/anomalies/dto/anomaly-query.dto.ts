//backend/src/anomalies/dto/anomaly-query.dto.ts
import { IsEnum, IsOptional } from 'class-validator';
import { AnomalyStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
export class AnomalyQueryDto extends PaginationQueryDto { @IsOptional() @IsEnum(AnomalyStatus) status?: AnomalyStatus; }