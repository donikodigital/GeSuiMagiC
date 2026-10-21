//backend/src/expenses/dto/expense-query.dto.ts
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { OptionalBooleanQuery } from '../../common/validators/boolean-query.decorator';

/** Recherche/filtres sur les depenses (section 40). */
export class ExpenseQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(ExpenseStatus) status?: ExpenseStatus;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() materialId?: string;
  @IsOptional() @IsString() @MaxLength(200) supplier?: string;
  @IsOptional() @IsUUID() supervisorId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxAmount?: number;

  // Envoye par le frontend (filtre "inclure les archives") : sans ce champ, la liste etait refusee (400).
  @OptionalBooleanQuery() includeArchived?: boolean;
}
