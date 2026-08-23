import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ProjectStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ProjectQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
}
