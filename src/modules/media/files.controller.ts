import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';
import { promises as fs } from 'fs';
import { LocalStorageDriver } from '../../infrastructure/storage/local-storage.driver';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';

@Controller('files')
export class FilesController {
  constructor(private readonly local: LocalStorageDriver) {}

  /**
   * 本地文件回读（公开只读，2026-08 决策）：
   * 小程序 <image>/<video> 组件无法携带 Authorization 头，此前的 JWT 强制
   * 鉴权会导致用户上传内容在界面上无法显示。现改为公开只读——防遍历依赖
   * 日期分区 + UUID 文件名不可枚举。TODO(后续迭代)：升级为带短时签名的 URL，
   * 恢复所有权控制。
   */
  @Get(':y/:m/:d/:file')
  @SkipResponseWrap() // 二进制回读，无法包裹成 { code, data, message }
  async serve(
    @Param('y') y: string,
    @Param('m') m: string,
    @Param('d') d: string,
    @Param('file') file: string,
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

    try {
      await fs.access(full);
    } catch {
      throw new NotFoundException('file not found');
    }

    return res.sendFile(full);
  }
}
