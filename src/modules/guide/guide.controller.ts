import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { GuideService } from './guide.service';
import {
  AttachViewerBodyDto,
  AttachViewerDto,
  CreateShareEventDto,
  FavoriteGuideDto,
  GenerateGuideDto,
} from './guide.dto';
import {
  GuideCreateBodyDto,
  GuideFavoriteBodyDto,
  GuideGetBodyDto,
} from '../journey/journey-api.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

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

  @Post('journeys/guide/favorite')
  favoritePost(
    @CurrentUser() u: { id: string },
    @Body() body: GuideFavoriteBodyDto,
  ) {
    return this.guide.favoriteByJourney(
      u.id,
      body.journeyId,
      body.isFavorited,
    );
  }

  @Get('journeys/:id/guide/check')
  check(@CurrentUser() u: { id: string }, @Param('id') id: string) {
    return this.guide.checkEligibility(u.id, id);
  }

  @Get('journeys/:id/guide')
  getByJourney(@CurrentUser() u: { id: string }, @Param('id') id: string) {
    return this.guide.getForAggregate(u.id, id);
  }

  @Post('journeys/:id/guide')
  generate(
    @CurrentUser() u: { id: string },
    @Param('id') id: string,
    @Body() dto: GenerateGuideDto,
  ) {
    return this.guide.generate(u.id, id, {
      template: dto.template,
      templateId: dto.templateId,
      force: dto.force,
    });
  }

  @Post('journeys/:id/guide/favorite')
  favoriteByJourney(
    @CurrentUser() u: { id: string },
    @Param('id') id: string,
    @Body() dto: FavoriteGuideDto,
  ) {
    return this.guide.favoriteByJourney(u.id, id, dto?.isFavorited);
  }

  @Get('guides/:id')
  getOne(@CurrentUser() u: { id: string }, @Param('id') id: string) {
    return this.guide.getById(u.id, id);
  }

  @Post('guides/:id/favorite')
  favorite(
    @CurrentUser() u: { id: string },
    @Param('id') id: string,
    @Body() dto: FavoriteGuideDto,
  ) {
    return this.guide.toggleFavorite(u.id, id, dto?.isFavorited);
  }

  @Post('share-events')
  share(
    @CurrentUser() u: { id: string },
    @Body() dto: CreateShareEventDto,
  ) {
    return this.guide.recordShareEvent(u.id, dto);
  }

  @Post('share-events/viewer')
  attachViewerPost(
    @CurrentUser() u: { id: string },
    @Body() body: AttachViewerBodyDto,
  ) {
    return this.guide.attachViewer(u.id, body.id, body.viewerId);
  }

  @Patch('share-events/:id/viewer')
  attachViewer(
    @CurrentUser() u: { id: string },
    @Param('id') id: string,
    @Body() dto: AttachViewerDto,
  ) {
    return this.guide.attachViewer(u.id, id, dto.viewerId);
  }
}
