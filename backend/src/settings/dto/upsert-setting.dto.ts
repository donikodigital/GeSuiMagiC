//backend/src/settings/dto/upsert-setting.dto.ts
import { IsDefined, IsString, Matches, MaxLength } from 'class-validator';

export class UpsertSettingDto {
  // Cle technique : minuscules, chiffres, points, tirets et soulignes (ex: "notifications.low_balance").
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9_.-]*$/, { message: 'La cle doit commencer par une lettre minuscule et ne contenir que a-z, 0-9, ".", "-" ou "_".' })
  key: string;

  // Doit etre decore pour passer le ValidationPipe (whitelist) ; la taille est limitee dans le service.
  @IsDefined()
  value: unknown;
}
