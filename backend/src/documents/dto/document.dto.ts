//backend/src/documents/dto/document.dto.ts
import { ProjectDocumentType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ISO_DATE_REGEX } from '../../common/utils/month.util';

const DATE_MSG = { message: 'La date doit être au format AAAA-MM-JJ.' };

export class CreateProjectDocumentDto {
  @IsEnum(ProjectDocumentType) type!: ProjectDocumentType;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @Matches(ISO_DATE_REGEX, DATE_MSG) issuedAt?: string;
  @IsOptional() @Matches(ISO_DATE_REGEX, DATE_MSG) expiresAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateProjectDocumentDto {
  @IsOptional() @IsEnum(ProjectDocumentType) type?: ProjectDocumentType;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @Matches(ISO_DATE_REGEX, DATE_MSG) issuedAt?: string;
  /** Une nouvelle date d'expiration (renouvellement) relance le cycle d'alertes. */
  @IsOptional() @Matches(ISO_DATE_REGEX, DATE_MSG) expiresAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
