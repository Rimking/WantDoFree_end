import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  IsIn,
} from 'class-validator';
import { MEDIA_OWNER_TYPES } from './media.util';

export class PrepareMediaDto {
  @IsIn([...MEDIA_OWNER_TYPES])
  ownerType: (typeof MEDIA_OWNER_TYPES)[number];

  @IsString()
  ownerId: string;

  @IsString()
  kind: string;

  @IsString()
  mime: string;

  @IsInt()
  @Min(0)
  sizeBytes: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSec?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/** confirm：新契约优先；否则走旧 entryId+url */
export class ConfirmBodyDto {
  @IsOptional()
  @IsString()
  mediaId?: string;

  @IsOptional()
  @IsString()
  confirmToken?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSec?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  height?: number;

  @IsOptional()
  @IsString()
  entryId?: string;

  @IsOptional()
  @IsEnum(['photo', 'voice', 'image', 'audio'])
  kind?: 'photo' | 'voice' | 'image' | 'audio';

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;
}
