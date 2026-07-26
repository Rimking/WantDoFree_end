import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DraftService } from './draft.service';
import {
  DraftIdBodyDto,
  DraftListBodyDto,
  UpsertDraftDto,
} from './draft.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('drafts')
@UseGuards(JwtAuthGuard)
export class DraftController {
  constructor(private readonly draft: DraftService) {}

  // ─── 新契约 POST ────────────────────────────────────────

  @Post('list')
  listPost(
    @CurrentUser() u: { id: string },
    @Body() body: DraftListBodyDto,
  ) {
    return this.draft.list(u.id, body.kind);
  }

  @Post('get')
  getPost(
    @CurrentUser() u: { id: string },
    @Body() body: DraftIdBodyDto,
  ) {
    return this.draft.get(u.id, body.id);
  }

  @Post('save')
  savePost(
    @CurrentUser() u: { id: string },
    @Body() dto: UpsertDraftDto,
  ) {
    return this.draft.upsert(u.id, dto);
  }

  @Post('delete')
  deletePost(
    @CurrentUser() u: { id: string },
    @Body() body: DraftIdBodyDto,
  ) {
    return this.draft.remove(u.id, body.id);
  }

  // ─── 兼容 ───────────────────────────────────────────────

  @Get()
  list(@CurrentUser() u: { id: string }, @Query('kind') kind?: string) {
    return this.draft.list(u.id, kind);
  }

  @Get(':id')
  get(@CurrentUser() u: { id: string }, @Param('id') id: string) {
    return this.draft.get(u.id, id);
  }

  /** 新建或按 id 更新（屏14/15 暂存） */
  @Put()
  upsert(@CurrentUser() u: { id: string }, @Body() dto: UpsertDraftDto) {
    return this.draft.upsert(u.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: { id: string }, @Param('id') id: string) {
    return this.draft.remove(u.id, id);
  }
}
