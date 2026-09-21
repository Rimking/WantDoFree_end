import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpsertBudgetDto {
  @IsInt() @Min(2000) @Max(2100) year: number;
  @IsInt() @Min(0) amountCent: number;
}

export class PatchUserProfileDto {
  @IsOptional() @IsString() nickname?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsIn(['MALE', 'FEMALE']) gender?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MaxLength(40)
  bio?: string | null;
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
