//backend/src/supervisors/dto/set-supervisor-status.dto.ts
import { IsIn } from 'class-validator';

export class SetSupervisorStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'DISABLED'])
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
}
