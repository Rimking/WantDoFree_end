import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { normalizeShareChannel } from '../../common/enums/catalog';

export class GenerateGuideDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  template?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  templateId?: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

// keep class-validator IsBoolean used above

@ValidatorConstraint({ name: 'shareChannel', async: false })
class ShareChannelConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && normalizeShareChannel(value) != null;
  }
  defaultMessage() {
    return 'channel must be friend|moments|image (alias: timeline→moments)';
  }
}

export class CreateShareEventDto {
  @IsString()
  @Length(36, 36)
  journeyId: string;

  /** 可省略：服务端取该旅程最新 guide */
  @IsOptional()
  @IsString()
  @Length(36, 36)
  guideId?: string;

  @IsString()
  @Validate(ShareChannelConstraint)
  channel: string;

  @IsOptional()
  @IsString()
  @Length(36, 36)
  viewerId?: string;
}

export class AttachViewerDto {
  @IsString()
  @Length(36, 36)
  viewerId: string;
}

/** POST /share-events/viewer */
export class AttachViewerBodyDto extends AttachViewerDto {
  @IsString()
  @Length(36, 36)
  id: string;
}

export class FavoriteGuideDto {
  /** 若传入则设为指定值；省略则 toggle */
  @IsOptional()
  @IsBoolean()
  isFavorited?: boolean;
}
