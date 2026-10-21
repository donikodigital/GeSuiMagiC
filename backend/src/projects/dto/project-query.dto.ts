//backend/src/projects/dto/project-query.dto.ts
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ProjectStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ProjectQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsString() @MaxLength(200) city?: string;
  @IsOptional() @IsString() @MaxLength(200) country?: string;
  @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
}
