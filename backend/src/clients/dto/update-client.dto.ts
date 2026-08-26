//backend/src/clients/dto/update-client.dto.ts
import { IsOptional, IsString } from 'class-validator';

/** Champs modifiables par le superadmin. */
export class UpdateClientDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() profession?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() companyName?: string;
  @IsOptional() @IsString() companyAddress?: string;
  @IsOptional() @IsString() taxId?: string;
}
