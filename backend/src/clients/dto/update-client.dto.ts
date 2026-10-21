//backend/src/clients/dto/update-client.dto.ts
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Champs modifiables par le superadmin. */
export class UpdateClientDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) lastName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) profession?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(200) city?: string;
  @IsOptional() @IsString() @MaxLength(200) country?: string;
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @IsString() @MaxLength(500) companyAddress?: string;
  @IsOptional() @IsString() @MaxLength(100) taxId?: string;
}
