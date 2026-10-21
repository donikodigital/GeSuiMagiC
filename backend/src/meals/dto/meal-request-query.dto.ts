//backend/src/meals/dto/meal-request-query.dto.ts
import { IsEnum, IsOptional } from 'class-validator';
import { MealRequestStatus } from '@prisma/client';

export class MealRequestQueryDto {
  @IsOptional() @IsEnum(MealRequestStatus)
  status?: MealRequestStatus;
}
