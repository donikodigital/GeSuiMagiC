//backend/src/deposits/dto/deposit-query.dto.ts
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { DepositStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { OptionalBooleanQuery } from '../../common/validators/boolean-query.decorator';

export class DepositQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(DepositStatus) status?: DepositStatus;
  @IsOptional() @IsUUID() supervisorId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;

  // Envoye par le frontend (filtre "inclure les archives") : sans ce champ, la liste etait refusee (400).
  @OptionalBooleanQuery() includeArchived?: boolean;
}
