import { IsInt, Max, Min } from 'class-validator';

export class AcknowledgeLevelDto {
  @IsInt()
  @Min(1)
  @Max(6)
  level: number;
}
