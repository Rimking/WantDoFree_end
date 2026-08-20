import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JourneyService } from './journey.service';
import { JourneyAggregateService } from './journey-aggregate.service';
import { CreateJourneyDto } from './journey.dto';
import {
  HandbookListBodyDto,
  JourneyDetailBodyDto,
  JourneyHandbookDetailBodyDto,
  JourneyIdBodyDto,
  JourneyItemDetailBodyDto,
  JourneyListBodyDto,
  JourneyPlanGetBodyDto,
  JourneyPlanPlaceDeleteBodyDto,
  PlanPlaceCreateBodyDto,
  JourneyPlanSaveBodyDto,
  JourneyPlanToggleCheckBodyDto,
  JourneyStatusBodyDto,
  JourneyUpdateBodyDto,
} from './journey-api.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * 旅程 API（新契约：有参一律 POST + body）。
 * 旧 path 风格 GET/PATCH/DELETE 兼容端点已于 2026-08-20 全部下线。
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

  /**
   * 旅程详情页聚合（lean）：旅程基础 + 记录时间线 + 花费统计 + 按天地点。
   * 与 detail 互斥：detail 留给游记预览，本接口专供 JourneyDetail 页面。
   */
  @Post('item/detail')
  itemDetail(
    @CurrentUser() u: { id: string },
    @Body() body: JourneyItemDetailBodyDto,
  ) {
    const journeyId = body.journeyId ?? body.id;
    if (!journeyId) {
      throw new BadRequestException('journeyId or id is required');
    }
    return this.aggregate.itemDetail(u.id, journeyId);
  }

  /**
   * 游记预览页聚合（lean）：旅程基础 + 记录时间线 + 预定点列表。
   * 与 detail / itemDetail 互斥：本接口专供 HandbookView。
   */
  @Post('handbook/detail')
  handbookDetail(
    @CurrentUser() u: { id: string },
    @Body() body: JourneyHandbookDetailBodyDto,
  ) {
    const journeyId = body.journeyId ?? body.id;
    if (!journeyId) {
      throw new BadRequestException('journeyId or id is required');
    }
    return this.aggregate.handbookDetail(u.id, journeyId);
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
   * 新建预定点：单点追加，不整包覆盖；传已上传 mediaId 关联。
   * clientId 由服务端生成（内部幂等/删除用），前端不必传。
   */
  @Post('plan/place/create')
  planPlaceCreate(
    @CurrentUser() u: { id: string },
    @Body() body: PlanPlaceCreateBodyDto,
  ) {
    return this.journey
      .createPlanPlace(u.id, body.journeyId, body)
      .then((p) => this.journey.toPlanModule(p));
  }

  /**
   * 单点删除预定点：只传 clientId，后端联动删占位记录。
   * 契约见 docs/前端对接_预定点单点接口_2026-08-20.md
   */
  @Post('plan/place/delete')
  planPlaceDelete(
    @CurrentUser() u: { id: string },
    @Body() body: JourneyPlanPlaceDeleteBodyDto,
  ) {
    return this.journey
      .deletePlanPlace(u.id, body.journeyId, body.clientId)
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
}
