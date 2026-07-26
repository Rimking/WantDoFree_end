import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MediaService } from './media.service';
import { ConfirmBodyDto, PrepareMediaDto } from './media.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MAX_AUDIO_BYTES } from './media.util';

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** 统一上传契约第一步 */
  @Post('prepare')
  prepare(@CurrentUser() u: { id: string }, @Body() dto: PrepareMediaDto) {
    return this.media.prepare(u.id, dto);
  }

  /** 仅 local 驱动：接收 wx.uploadFile */
  @Post('local-upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_AUDIO_BYTES },
    }),
  )
  localUpload(
    @CurrentUser() u: { id: string },
    @Body('mediaId') mediaId: string,
    @Body('confirmToken') confirmToken: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.media.localUpload(u.id, mediaId, confirmToken, file);
  }

  /** 统一上传契约第三步（兼容旧 entryId+url confirm） */
  @Post('confirm')
  confirm(@CurrentUser() u: { id: string }, @Body() dto: ConfirmBodyDto) {
    if (dto.confirmToken && dto.mediaId) {
      return this.media.confirm(u.id, {
        mediaId: dto.mediaId,
        confirmToken: dto.confirmToken,
        durationSec: dto.durationSec,
        width: dto.width,
        height: dto.height,
      });
    }
    if (dto.entryId && dto.kind && dto.url) {
      return this.media.confirmLegacy(u.id, {
        entryId: dto.entryId,
        kind: dto.kind,
        url: dto.url,
        size: dto.size,
      });
    }
    throw new BadRequestException(
      '请提供 mediaId+confirmToken，或兼容字段 entryId+kind+url',
    );
  }

  /** @deprecated 请改用 POST /media/prepare */
  @Get('upload-url')
  uploadUrl(
    @CurrentUser() u: { id: string },
    @Query('key') key: string,
    @Query('kind') kind: string,
  ) {
    return this.media.getUploadUrlLegacy(u.id, key, kind);
  }
}
