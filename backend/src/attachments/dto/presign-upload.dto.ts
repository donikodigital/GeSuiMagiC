import { IsIn, IsString, MinLength } from 'class-validator';

export class PresignUploadDto {
  @IsString() @MinLength(1)
  fileName: string;

  @IsString()
  mimeType: string;

  @IsIn(['photo', 'facture', 'recu', 'bon_livraison', 'document'])
  kind: string;
}
