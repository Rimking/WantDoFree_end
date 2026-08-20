import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RecordingService } from './recording.service';
import {
  RecordIdBodyDto,
  RecordTimeBodyDto,
  RecordUpdateBodyDto,
  CreateEntryBodyDto,
} from './recording.dto';
import {
  EntriesDeleteBodyDto,
  EntriesListBodyDto,
  EntriesRecentBodyDto,
} from '../journey/journey-api.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * 记录 API（新契约：有参一律 POST + body）。
 * 旧 path 风格 GET/PATCH/DELETE 兼容端点已于 2026-08-20 全部下线。
 */
@Controller('journeys')
@UseGuards(JwtAuthGuard)
export class RecordingController {
  constructor(private readonly recording: RecordingService) {}

  @Post('entries/list')
  async listPost(
    @CurrentUser() u: { id: string },
    @Body() body: EntriesListBodyDto,
  ) {
    const rows = await this.recording.listByJourney(
      u.id,
      body.journeyId,
      body.dayIndex,
    );
    if (body.modular === false) return rows;
    return rows.map((e) => this.recording.toEntryModule(e));
  }

  /** 首页最近记录：当前用户跨旅程最近 10 条 */
  @Post('entries/recent')
  recentPost(
    @CurrentUser() u: { id: string },
    @Body() body: EntriesRecentBodyDto,
  ) {
    return this.recording.listRecent(u.id, body?.limit ?? 10);
  }

  /**
   * 新建记录（单条）：一次提交该记录全部信息（内容/定位/花费/媒体）。
   * 媒体先经 /media/prepare 上传拿到 URL 再提交；无 clientId/city。
   */
  @Post('entries/create')
  createPost(
    @CurrentUser() u: { id: string },
    @Body() body: CreateEntryBodyDto,
  ) {
    return this.recording.createEntry(u.id, body);
  }

  @Post('entries/delete')
  deletePost(
    @CurrentUser() u: { id: string },
    @Body() body: EntriesDeleteBodyDto,
  ) {
    return this.recording.removeEntries(u.id, body.journeyId, {
      entryIds: body.entryIds,
      from: body.from,
      to: body.to,
    });
  }
}

@Controller('records')
@UseGuards(JwtAuthGuard)
export class RecordsController {
  constructor(private readonly recording: RecordingService) {}

  /** 首页最近记录：按时间倒序，最多 10 条（与 /journeys/entries/recent 同构） */
  @Post('recent')
  recentPost(
    @CurrentUser() u: { id: string },
    @Body() body: EntriesRecentBodyDto,
  ) {
    return this.recording.listRecent(u.id, body?.limit ?? 10);
  }

  @Post('update')
  updatePost(
    @CurrentUser() u: { id: string },
    @Body() body: RecordUpdateBodyDto,
  ) {
    const { recordId, ...dto } = body;
    return this.recording.patchRecord(u.id, recordId, dto);
  }

  @Post('delete')
  deletePost(
    @CurrentUser() u: { id: string },
    @Body() body: RecordIdBodyDto,
  ) {
    return this.recording.removeRecord(u.id, body.recordId);
  }

  @Post('time')
  timePost(
    @CurrentUser() u: { id: string },
    @Body() body: RecordTimeBodyDto,
  ) {
    const { recordId, ...dto } = body;
    return this.recording.patchRecordTime(u.id, recordId, dto);
  }
}
