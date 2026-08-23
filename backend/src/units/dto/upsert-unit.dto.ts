import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertUnitDto {
  @IsString() @MinLength(1)
  name: string;

  @IsOptional() @IsString()
  symbol?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
