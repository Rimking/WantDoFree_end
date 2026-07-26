import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateChecklistDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  title: string;

  @IsOptional()
  @IsBoolean()
  isDefaultChecked?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  remindBeforeDays?: number | null;
}

export class PatchChecklistDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  title?: string;

  @IsOptional()
  @IsBoolean()
  isDefaultChecked?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  remindBeforeDays?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class ToggleChecklistDto {
  @IsBoolean()
  isChecked: boolean;
}

export class ReorderChecklistItemDto {
  @IsString()
  id: string;

  @IsInt()
  @Min(0)
  sortOrder: number;
}

export class ReorderChecklistDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderChecklistItemDto)
  items: ReorderChecklistItemDto[];
}

export class ChecklistJourneyIdBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  journeyId: string;
}

export class ChecklistCreateBodyDto extends CreateChecklistDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  journeyId: string;
}

export class ChecklistReorderBodyDto extends ReorderChecklistDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  journeyId: string;
}

export class ChecklistUpdateBodyDto extends PatchChecklistDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;
}

export class ChecklistToggleBodyDto extends ToggleChecklistDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;
}

export class ChecklistIdBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;
}
