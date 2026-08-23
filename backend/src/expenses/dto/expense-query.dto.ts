import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/** Recherche/filtres sur les depenses (section 40). */
export class ExpenseQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ExpenseStatus) status?: ExpenseStatus;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() materialId?: string;
  @IsOptional() @IsString() supplier?: string;
  @IsOptional() @IsString() supervisorId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsNumber() minAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maxAmount?: number;
}
