import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() nick?: string;
  @IsOptional() @IsString() nickname?: string;
  @IsOptional() @IsString() avatar?: string;
  @IsOptional() @IsString() avatarUrl?: string;
}

export class UpsertBudgetDto {
  @IsInt() @Min(2000) @Max(2100) year: number;
  @IsInt() @Min(0) amountCent: number;
}

export class PatchUserProfileDto {
  @IsOptional() @IsString() nickname?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsIn(['MALE', 'FEMALE', 'UNKNOWN']) gender?: string;
  /** YYYY-MM-DD 或 null 清空 */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  birthday?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(/^\d{6}$/)
  provinceCode?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(/^\d{6}$/)
  cityCode?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MaxLength(64)
  departureCity?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MaxLength(40)
  bio?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  identities?: string[];
}

export class AvatarPresignDto {
  @IsString()
  @IsIn(['jpg', 'jpeg', 'png', 'webp'])
  ext: string;

  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType: string;
}

export class NicknameCheckDto {
  @IsString()
  @Length(1, 12)
  nickname: string;
}
