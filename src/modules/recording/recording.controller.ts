import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RecordingService } from './recording.service';
import {
  DeleteEntriesDto,
  PatchRecordDto,
  PatchRecordTimeDto,
  RecordIdBodyDto,
  RecordTimeBodyDto,
  RecordUpdateBodyDto,
  SyncBatchDto,
} from './recording.dto';
import {
  EntriesDeleteBodyDto,
  EntriesListBodyDto,
  EntriesRecentBodyDto,
  EntriesSyncBodyDto,
} from '../journey/journey-api.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('journeys')
@UseGuards(JwtAuthGuard)
export class RecordingController {
  constructor(private readonly recording: RecordingService) {}

  // ─── 新契约 POST ────────────────────────────────────────

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

  @Post('entries/sync')
  syncPost(
    @CurrentUser() u: { id: string },
    @Body() body: EntriesSyncBodyDto,
  ) {
    return this.recording.sync(u.id, body.journeyId, body.entries);
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

  // ─── 兼容 ───────────────────────────────────────────────

  @Post(':id/entries/sync')
  sync(
    @CurrentUser() u: { id: string },
    @Param('id') id: string,
    @Body() dto: SyncBatchDto,
  ) {
    return this.recording.sync(u.id, id, dto.entries);
  }

  @Get(':id/entries')
  list(@CurrentUser() u: { id: string }, @Param('id') id: string) {
    return this.recording.listByJourney(u.id, id);
  }

  @Get(':id/records')
  listRecords(
    @CurrentUser() u: { id: string },
    @Param('id') id: string,
    @Query('dayIndex') dayIndex?: string,
  ) {
    const day =
      dayIndex != null && dayIndex !== ''
        ? parseInt(dayIndex, 10)
        : undefined;
    return this.recording.listByJourney(
      u.id,
      id,
      Number.isFinite(day as number) ? day : undefined,
    );
  }

  @Delete(':id/entries/:entryId')
  removeOne(
    @CurrentUser() u: { id: string },
    @Param('id') id: string,
    @Param('entryId') entryId: string,
  ) {
    return this.recording.removeEntry(u.id, id, entryId);
  }

  @Post(':id/entries/delete')
  removeMany(
    @CurrentUser() u: { id: string },
    @Param('id') id: string,
    @Body() dto: DeleteEntriesDto,
  ) {
    return this.recording.removeEntries(u.id, id, dto);
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

  @Patch(':recordId')
  patch(
    @CurrentUser() u: { id: string },
    @Param('recordId') recordId: string,
    @Body() dto: PatchRecordDto,
  ) {
    return this.recording.patchRecord(u.id, recordId, dto);
  }

  @Patch(':recordId/time')
  patchTime(
    @CurrentUser() u: { id: string },
    @Param('recordId') recordId: string,
    @Body() dto: PatchRecordTimeDto,
  ) {
    return this.recording.patchRecordTime(u.id, recordId, dto);
  }

  @Delete(':recordId')
  remove(
    @CurrentUser() u: { id: string },
    @Param('recordId') recordId: string,
  ) {
    return this.recording.removeRecord(u.id, recordId);
  }
}
