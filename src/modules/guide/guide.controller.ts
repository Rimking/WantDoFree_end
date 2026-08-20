import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { GuideService } from './guide.service';
import {
  GuideCreateBodyDto,
  GuideGetBodyDto,
} from '../journey/journey-api.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * 游记 API（新契约：有参一律 POST + body）。
 * 收藏 / 分享事件 / 旧 path 兼容端点已于 2026-08-20 全部下线。
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class GuideController {
  constructor(private readonly guide: GuideService) {}

  @Post('journeys/guide/get')
  getPost(
    @CurrentUser() u: { id: string },
    @Body() body: GuideGetBodyDto,
  ) {
    return this.guide.getForAggregate(u.id, body.journeyId);
  }

  @Post('journeys/guide/create')
  createPost(
    @CurrentUser() u: { id: string },
    @Body() body: GuideCreateBodyDto,
  ) {
    return this.guide.generate(u.id, body.journeyId, {
      template: body.template,
      templateId: body.templateId,
      force: body.force,
    });
  }

  @Get('journeys/:id/guide/check')
  check(@CurrentUser() u: { id: string }, @Param('id') id: string) {
    return this.guide.checkEligibility(u.id, id);
  }

  @Get('guides/:id')
  getOne(@CurrentUser() u: { id: string }, @Param('id') id: string) {
    return this.guide.getById(u.id, id);
  }
}
