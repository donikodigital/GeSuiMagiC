//backend/src/purchasing/dto/purchasing.dto.ts
import { StockMovementType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { IsMoneyAmount } from '../../common/validators/money-amount.decorator';
import { ISO_DATE_REGEX } from '../../common/utils/month.util';

const QTY = { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 } as const;
const DATE_MSG = { message: 'La date doit être au format AAAA-MM-JJ.' };

export class OrderLineDto {
  @IsString() @MinLength(2) @MaxLength(200) label!: string;
  @IsString() @MinLength(1) @MaxLength(20) unit!: string;
  @IsNumber(QTY) @Min(0.001) @Max(100_000_000) quantityOrdered!: number;
  @IsOptional() @IsMoneyAmount() unitPrice?: number;
}

export class CreateOrderDto {
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() @MaxLength(150) supplierName?: string;
  @IsOptional() @IsUUID() phaseId?: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @Matches(ISO_DATE_REGEX, DATE_MSG) orderDate?: string;
  @IsOptional() @Matches(ISO_DATE_REGEX, DATE_MSG) expectedDate?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => OrderLineDto)
  lines!: OrderLineDto[];
}

export class OrderQueryDto {
  @IsOptional() @IsIn(['ORDERED', 'PARTIAL', 'DELIVERED', 'CANCELLED']) status?: 'ORDERED' | 'PARTIAL' | 'DELIVERED' | 'CANCELLED';
}

export class DeliveryLineDto {
  /** Ligne de commande concernee (livraison rattachee a une commande). */
  @IsOptional() @IsUUID() orderLineId?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) label?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(20) unit?: string;
  @IsNumber(QTY) @Min(0.001) @Max(100_000_000) quantityReceived!: number;
  /** Part refusee (casse, non conforme) : elle n'entre pas en stock. */
  @IsOptional() @IsNumber(QTY) @Min(0) @Max(100_000_000) quantityRefused?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CreateDeliveryDto {
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() @MaxLength(150) supplierName?: string;
  /** Numero du bon de livraison fourni par le fournisseur. */
  @IsOptional() @IsString() @MaxLength(100) noteReference?: string;
  @IsOptional() @Matches(ISO_DATE_REGEX, DATE_MSG) date?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;

  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(64) clientRef?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => DeliveryLineDto)
  lines!: DeliveryLineDto[];
}

export class CancelOrderDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class CreateStockItemDto {
  @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @IsString() @MinLength(1) @MaxLength(20) unit!: string;
  @IsOptional() @IsNumber(QTY) @Min(0) @Max(100_000_000) minQuantity?: number;
}

export class UpdateStockItemDto {
  @IsOptional() @IsNumber(QTY) @Min(0) @Max(100_000_000) minQuantity?: number | null;
}

export class CreateStockMovementDto {
  /** OUT = consommation sur une etape, LOSS = perte/vol/casse, ADJUSTMENT = correction d'inventaire (quantite signee). */
  @IsIn(['OUT', 'LOSS', 'ADJUSTMENT'])
  type!: Exclude<StockMovementType, 'IN'>;

  @IsNumber(QTY) @Min(-100_000_000) @Max(100_000_000)
  quantity!: number;

  @IsOptional() @IsUUID() phaseId?: string;
  @IsOptional() @Matches(ISO_DATE_REGEX, DATE_MSG) date?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(64) clientRef?: string;
}

export class MovementQueryDto {
  @IsOptional() @IsUUID() stockItemId?: string;
  @IsOptional() @IsUUID() phaseId?: string;
  @IsOptional() @IsIn(['IN', 'OUT', 'LOSS', 'ADJUSTMENT']) type?: StockMovementType;
}
