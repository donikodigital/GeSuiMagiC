import { IsOptional, IsString } from 'class-validator';

export class UpsertSettingDto {
  @IsString()
  key: string;

  value: unknown;

  @IsOptional() @IsString()
  projectId?: string;
}
