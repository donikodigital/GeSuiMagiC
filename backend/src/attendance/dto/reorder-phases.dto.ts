//backend/src/attendance/dto/reorder-phases.dto.ts
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/** Liste COMPLETE des identifiants d'etapes du projet, dans le nouvel ordre. */
export class ReorderPhasesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique() @IsUUID('all', { each: true })
  orderedIds!: string[];
}
