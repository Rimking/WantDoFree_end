import {
  Body,
  Controller,
  HttpCode,
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
} from './checklist.dto';

/**
 * 准备清单 API（新契约：有参一律 POST + body）。
 * 旧 path 风格 GET/PATCH/DELETE 兼容端点已于 2026-08-20 全部下线。
 */
@Controller('journeys')
@UseGuards(JwtAuthGuard)
export class ChecklistJourneyController {
  constructor(private readonly checklist: ChecklistService) {}

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
}
