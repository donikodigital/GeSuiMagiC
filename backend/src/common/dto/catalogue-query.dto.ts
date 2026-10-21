//backend/src/common/dto/catalogue-query.dto.ts
import { IsOptional, IsUUID } from 'class-validator';
import { OptionalBooleanQuery } from '../validators/boolean-query.decorator';

/** Filtres communs aux listes du catalogue (categories, unites). */
export class CatalogueQueryDto {
  @OptionalBooleanQuery()
  includeInactive?: boolean;
}

export class MaterialQueryDto extends CatalogueQueryDto {
  @IsOptional() @IsUUID()
  categoryId?: string;
}
