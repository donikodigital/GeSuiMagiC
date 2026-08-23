import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { DepositStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class DepositQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(DepositStatus) status?: DepositStatus;
  @IsOptional() @IsString() supervisorId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
