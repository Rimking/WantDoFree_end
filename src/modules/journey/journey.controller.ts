import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JourneyService } from './journey.service';
import { JourneyAggregateService } from './journey-aggregate.service';
import {
  CreateJourneyDto,
  ListJourneyQueryDto,
  PatchPlanDto,
  UpdateJourneyDto,
  UpdateStatusDto,
  UpsertPlanDto,
} from './journey.dto';
import {
  HandbookListBodyDto,
  JourneyDetailBodyDto,
  JourneyIdBodyDto,
  JourneyListBodyDto,
  JourneyPlanGetBodyDto,
  JourneyPlanSaveBodyDto,
  JourneyPlanToggleCheckBodyDto,
  JourneyStatusBodyDto,
  JourneyUpdateBodyDto,
} from './journey-api.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * 旅程 API。
 * 新契约（盘点文档）：有参一律 POST + body；无参可 GET。
 * 旧 path 风格 GET/PATCH/DELETE 保留一期兼容。
 */
@Controller('journeys')
@UseGuards(JwtAuthGuard)
export class JourneyController {
  constructor(
    private readonly journey: JourneyService,
    private readonly aggregate: JourneyAggregateService,
  ) {}

  // ─── 新契约：静态路径优先 ───────────────────────────────

  @Post('create')
  async createNamed(
    @CurrentUser() u: { id: string },
    @Body() dto: CreateJourneyDto,
  ) {
    const item = await this.journey.create(u.id, dto);
    return this.journey.toModularListItem(item);
  }

  @Post('list')
  listPost(
    @CurrentUser() u: { id: string },
    @Body() body: JourneyListBodyDto,
  ) {
    return this.aggregate.listModular(u.id, body);
  }

  /** 游记工作台：带四态聚合，避免前端 N+1 */
  @Post('handbook/list')
  handbookList(
    @CurrentUser() u: { id: string },
    @Body() body: HandbookListBodyDto,
  ) {
    return this.journey.handbookList(u.id, { phase: body.phase });
  }

  @Post('get')
  getPost(
    @CurrentUser() u: { id: string },
    @Body() body: JourneyIdBodyDto,
  ) {
    return this.aggregate.getModular(u.id, body.id);
  }

  /** P0 详情聚合（始终含 handbook；include 可含 handbook） */
  @Post('detail')
  detailPost(
    @CurrentUser() u: { id: string },
    @Body() body: JourneyDetailBodyDto,
  ) {
    const journeyId = body.journeyId ?? body.id;
    if (!journeyId) {
      throw new BadRequestException('journeyId or id is required');
    }
    return this.aggregate.detail(u.id, journeyId, body.include);
  }

  @Post('update')
  async updatePost(
    @CurrentUser() u: { id: string },
    @Body() body: JourneyUpdateBodyDto,
  ) {
    const { id, ...dto } = body;
    const item = await this.journey.update(u.id, id, dto);
    return this.journey.toModularListItem(item);
  }

  @Post('delete')
  deletePost(
    @CurrentUser() u: { id: string },
    @Body() body: JourneyIdBodyDto,
  ) {
    return this.journey.remove(u.id, body.id);
  }

  @Post('status')
  async statusBody(
    @CurrentUser() u: { id: string },
    @Body() body: JourneyStatusBodyDto,
  ) {
    const { id, ...dto } = body;
    const item = await this.journey.updateStatus(u.id, id, dto);
    return this.journey.toModularListItem(item);
  }

  @Post('finish')
  async finishBody(
    @CurrentUser() u: { id: string },
    @Body() body: JourneyIdBodyDto,
  ) {
    const item = await this.journey.finish(u.id, body.id);
    return this.journey.toModularListItem(item);
  }

  @Post('plan/get')
  planGet(
    @CurrentUser() u: { id: string },
    @Body() body: JourneyPlanGetBodyDto,
  ) {
    return this.journey
      .getPlan(u.id, body.journeyId)
      .then((p) => this.journey.toPlanModule(p));
  }

  @Post('plan/save')
  planSave(
    @CurrentUser() u: { id: string },
    @Body() body: JourneyPlanSaveBodyDto,
  ) {
    const { journeyId, ...dto } = body;
    return this.journey
      .putPlan(u.id, journeyId, dto)
      .then((p) => this.journey.toPlanModule(p));
  }

  /**
   * @deprecated 勿用于准备事项进度；真源为 /checklist/toggle。
   * 仅兼容旧客户端写 plan.checks。
   */
  @Post('plan/toggleCheck')
  planToggle(
    @CurrentUser() u: { id: string },
    @Body() body: JourneyPlanToggleCheckBodyDto,
  ) {
    return this.journey
      .togglePlanCheck(u.id, body.journeyId, body.checkId)
      .then((p) => this.journey.toPlanModule(p));
  }

  // ─── 兼容：旧 path / 方法 ───────────────────────────────

  @Post()
  create(@CurrentUser() u: { id: string }, @Body() dto: CreateJourneyDto) {
    return this.journey.create(u.id, dto);
  }

  @Get()
  list(
    @CurrentUser() u: { id: string },
    @Query() query: ListJourneyQueryDto,
  ) {
    return this.journey.list(u.id, query.status, query.displayStatus);
  }

  @Get(':id')
  detail(@CurrentUser() u: { id: string }, @Param('id') id: string) {
    return this.journey.detail(u.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() u: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateJourneyDto,
  ) {
    return this.journey.update(u.id, id, dto);
  }

  @Put(':id')
  updatePut(
    @CurrentUser() u: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateJourneyDto,
  ) {
    return this.journey.update(u.id, id, dto);
  }

  @Post(':id/status')
  statusPost(
    @CurrentUser() u: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.journey.updateStatus(u.id, id, dto);
  }

  @Patch(':id/status')
  statusPatch(
    @CurrentUser() u: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.journey.updateStatus(u.id, id, dto);
  }

  @Post(':id/finish')
  finish(@CurrentUser() u: { id: string }, @Param('id') id: string) {
    return this.journey.finish(u.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() u: { id: string }, @Param('id') id: string) {
    return this.journey.remove(u.id, id);
  }

  @Get(':id/plan')
  getPlan(@CurrentUser() u: { id: string }, @Param('id') id: string) {
    return this.journey
      .getPlan(u.id, id)
      .then((p) => this.journey.toPlanModule(p));
  }

  @Put(':id/plan')
  putPlan(
    @CurrentUser() u: { id: string },
    @Param('id') id: string,
    @Body() dto: UpsertPlanDto,
  ) {
    return this.journey.putPlan(u.id, id, dto);
  }

  @Patch(':id/plan')
  patchPlan(
    @CurrentUser() u: { id: string },
    @Param('id') id: string,
    @Body() dto: PatchPlanDto,
  ) {
    return this.journey.patchPlan(u.id, id, dto);
  }
}
