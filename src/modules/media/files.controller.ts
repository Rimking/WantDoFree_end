import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';
import { promises as fs } from 'fs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LocalStorageDriver } from '../../infrastructure/storage/local-storage.driver';
import { MediaService } from './media.service';

@Controller('files')
export class FilesController {
  constructor(
    private readonly local: LocalStorageDriver,
    private readonly media: MediaService,
  ) {}

  /**
   * 本地文件回读：一律登录 + 所有权校验；并挡路径穿越。
   */
  @Get(':y/:m/:d/:file')
  @UseGuards(JwtAuthGuard)
  async serve(
    @Param('y') y: string,
    @Param('m') m: string,
    @Param('d') d: string,
    @Param('file') file: string,
    @CurrentUser() u: { id: string },
    @Res() res: Response,
  ) {
    if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) {
      throw new ForbiddenException('invalid path');
    }
    if (file.includes('..') || file.includes('/') || file.includes('\\')) {
      throw new ForbiddenException('invalid file');
    }

    const relative = path.join(y, m, d, file);
    const normalized = path.normalize(relative);
    if (normalized !== relative && normalized !== path.posix.join(y, m, d, file)) {
      throw new ForbiddenException('path traversal');
    }

    let full: string;
    try {
      full = this.local.absolutePath(normalized);
    } catch {
      throw new ForbiddenException('path escape');
    }

    const storageKey = normalized.replace(/\\/g, '/');
    const row = await this.media.findOwnedFile(u.id, storageKey);
    if (!row) throw new ForbiddenException('file not owned');

    try {
      await fs.access(full);
    } catch {
      throw new NotFoundException('file not found');
    }

    return res.sendFile(full);
  }
}
