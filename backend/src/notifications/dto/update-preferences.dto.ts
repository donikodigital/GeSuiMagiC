//backend/src/notifications/dto/update-preferences.dto.ts
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import { E164_REGEX } from '../messaging.service';

/** Canaux WhatsApp / SMS de l'utilisateur. messagingPhone: null efface le numero (et desactive les canaux). */
export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsString()
  @Matches(E164_REGEX, { message: 'Le numéro doit être au format international, par exemple +224620000000.' })
  messagingPhone?: string | null;

  @IsOptional() @IsBoolean()
  whatsappOptIn?: boolean;

  @IsOptional() @IsBoolean()
  smsOptIn?: boolean;
}
