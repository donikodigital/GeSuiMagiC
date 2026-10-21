//backend/src/projects/dto/assign-supervisor.dto.ts
import { IsUUID } from 'class-validator';

export class AssignSupervisorDto {
  @IsUUID()
  supervisorId: string;
}
