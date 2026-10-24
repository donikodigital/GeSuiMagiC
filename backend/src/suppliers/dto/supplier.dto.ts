//backend/src/suppliers/dto/supplier.dto.ts
import { SupplierKind } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { OptionalBooleanQuery } from '../../common/validators/boolean-query.decorator';

export class CreateSupplierDto {
  @IsString() @MinLength(2) @MaxLength(150)
  name!: string;

  @IsOptional() @IsEnum(SupplierKind)
  kind?: SupplierKind;

  /** Corps de metier ou specialite (ex: « Plomberie », « Quincaillerie »). */
  @IsOptional() @IsString() @MaxLength(100) trade?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(60) taxId?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateSupplierDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(150) name?: string;
  @IsOptional() @IsEnum(SupplierKind) kind?: SupplierKind;
  @IsOptional() @IsString() @MaxLength(100) trade?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(150) email?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(60) taxId?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SupplierQueryDto {
  @IsOptional() @IsEnum(SupplierKind) kind?: SupplierKind;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @OptionalBooleanQuery() includeInactive?: boolean;
}
