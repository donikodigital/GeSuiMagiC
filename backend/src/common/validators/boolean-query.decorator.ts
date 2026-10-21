//backend/src/common/validators/boolean-query.decorator.ts
import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Booleen optionnel passe en query string ("true"/"false").
 * Sans cela, `enableImplicitConversion` transforme la chaine "false" en `true`
 * (Boolean("false") === true) : un filtre `includeArchived=false` s'activait.
 */
export function OptionalBooleanQuery() {
  return applyDecorators(
    IsOptional(),
    Transform(({ value }) => (value === true || value === 'true' || value === '1' ? true : value === false || value === 'false' || value === '0' ? false : value)),
    IsBoolean(),
  );
}
