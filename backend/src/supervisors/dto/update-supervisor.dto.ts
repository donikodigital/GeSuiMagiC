import { IsOptional, IsString } from 'class-validator';

export class UpdateSupervisorDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() profession?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsString() idDocumentUrl?: string;
  @IsOptional() @IsString() notes?: string;
}
