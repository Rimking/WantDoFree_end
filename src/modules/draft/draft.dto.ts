import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class UpsertDraftDto {
  @IsOptional()
  @IsString()
  @Length(36, 36)
  id?: string;

  @IsEnum(['entry', 'journey'])
  kind: 'entry' | 'journey';

  @IsOptional()
  @IsString()
  @Length(36, 36)
  journeyId?: string;

  @IsObject()
  payload: Record<string, unknown>;
}

export class DraftListBodyDto {
  @IsOptional()
  @IsEnum(['entry', 'journey'])
  kind?: 'entry' | 'journey';
}

export class DraftIdBodyDto {
  @IsString()
  @Length(36, 36)
  id: string;
}
