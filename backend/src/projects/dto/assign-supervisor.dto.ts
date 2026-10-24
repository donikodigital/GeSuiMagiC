//backend/src/projects/dto/assign-supervisor.dto.ts
import { SupervisorPosition } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class AssignSupervisorDto {
  @IsUUID()
  supervisorId: string;

  /**
   * Fonction sur ce chantier : SUPERVISOR (saisie et paiements), SITE_MANAGER (conducteur de travaux) ou ARCHITECT.
   * Absente : SUPERVISOR pour une nouvelle affectation, fonction inchangée pour une réaffectation.
   */
  @IsOptional() @IsEnum(SupervisorPosition)
  position?: SupervisorPosition;
}

export class UpdateSupervisorPositionDto {
  @IsEnum(SupervisorPosition)
  position: SupervisorPosition;
}
