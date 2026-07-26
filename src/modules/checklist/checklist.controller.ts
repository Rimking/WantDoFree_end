import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChecklistService } from './checklist.service';
import {
  ChecklistCreateBodyDto,
  ChecklistIdBodyDto,
  ChecklistJourneyIdBodyDto,
  ChecklistReorderBodyDto,
  ChecklistToggleBodyDto,
  ChecklistUpdateBodyDto,
  CreateChecklistDto,
  PatchChecklistDto,
  ReorderChecklistDto,
  ToggleChecklistDto,
} from './checklist.dto';

@Controller('journeys')
@UseGuards(JwtAuthGuard)
export class ChecklistJourneyController {
  constructor(private readonly checklist: ChecklistService) {}

  // ─── 新契约 POST（静态路径）──────────────────────────────

  @Post('checklist/list')
  listPost(
    @CurrentUser() u: { id: string },
    @Body() body: ChecklistJourneyIdBodyDto,
  ) {
    return this.checklist.list(u.id, body.journeyId);
  }

  @Post('checklist/create')
  createPost(
    @CurrentUser() u: { id: string },
    @Body() body: ChecklistCreateBodyDto,
  ) {
    const { journeyId, ...dto } = body;
    return this.checklist.create(u.id, journeyId, dto);
  }

  @Post('checklist/reorder')
  @HttpCode(204)
  reorderPost(
    @CurrentUser() u: { id: string },
    @Body() body: ChecklistReorderBodyDto,
  ) {
    const { journeyId, ...dto } = body;
    return this.checklist.reorder(u.id, journeyId, dto);
  }

  // ─── 兼容 path ───────────────────────────────────────────

  @Get(':journeyId/checklist')
  list(
    @CurrentUser() u: { id: string },
    @Param('journeyId') journeyId: string,
  ) {
    return this.checklist.list(u.id, journeyId);
  }

  @Post(':journeyId/checklist')
  create(
    @CurrentUser() u: { id: string },
    @Param('journeyId') journeyId: string,
    @Body() dto: CreateChecklistDto,
  ) {
    return this.checklist.create(u.id, journeyId, dto);
  }

  @Patch(':journeyId/checklist/reorder')
  @HttpCode(204)
  reorder(
    @CurrentUser() u: { id: string },
    @Param('journeyId') journeyId: string,
    @Body() dto: ReorderChecklistDto,
  ) {
    return this.checklist.reorder(u.id, journeyId, dto);
  }
}

@Controller('checklist')
@UseGuards(JwtAuthGuard)
export class ChecklistController {
  constructor(private readonly checklist: ChecklistService) {}

  @Post('update')
  updatePost(
    @CurrentUser() u: { id: string },
    @Body() body: ChecklistUpdateBodyDto,
  ) {
    const { id, ...dto } = body;
    return this.checklist.patch(u.id, id, dto);
  }

  @Post('toggle')
  togglePost(
    @CurrentUser() u: { id: string },
    @Body() body: ChecklistToggleBodyDto,
  ) {
    const { id, ...dto } = body;
    return this.checklist.toggle(u.id, id, dto);
  }

  @Post('delete')
  @HttpCode(204)
  deletePost(
    @CurrentUser() u: { id: string },
    @Body() body: ChecklistIdBodyDto,
  ) {
    return this.checklist.softDelete(u.id, body.id);
  }

  @Patch(':itemId')
  patch(
    @CurrentUser() u: { id: string },
    @Param('itemId') itemId: string,
    @Body() dto: PatchChecklistDto,
  ) {
    return this.checklist.patch(u.id, itemId, dto);
  }

  @Patch(':itemId/toggle')
  toggle(
    @CurrentUser() u: { id: string },
    @Param('itemId') itemId: string,
    @Body() dto: ToggleChecklistDto,
  ) {
    return this.checklist.toggle(u.id, itemId, dto);
  }

  @Delete(':itemId')
  @HttpCode(204)
  remove(
    @CurrentUser() u: { id: string },
    @Param('itemId') itemId: string,
  ) {
    return this.checklist.softDelete(u.id, itemId);
  }
}
