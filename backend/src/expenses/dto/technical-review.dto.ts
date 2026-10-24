//backend/src/expenses/dto/technical-review.dto.ts
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class TechnicalReviewDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  /** Obligatoire en cas de refus. */
  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}
