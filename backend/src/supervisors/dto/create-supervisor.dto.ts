//backend/src/supervisors/dto/create-supervisor.dto.ts
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** Creation d'un superviseur par le client (section 10). */
export class CreateSupervisorDto {
  @IsEmail()
  email: string;

  @IsString() @MinLength(1)
  firstName: string;

  @IsString() @MinLength(1)
  lastName: string;

  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() profession?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsString() idDocumentUrl?: string;
  @IsOptional() @IsString() notes?: string;
}
