import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { LocationService } from './location.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class JourneyLocationsClearBodyDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;
}

/**
 * 位置清理 API（新契约：POST + body）。
 * 旧 DELETE 兼容端点已于 2026-08-20 下线。
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class LocationController {
  constructor(private readonly location: LocationService) {}

  @Post('me/locations/clear')
  clearMinePost(@CurrentUser() u: { id: string }) {
    return this.location.clearByUser(u.id);
  }

  @Post('journeys/locations/clear')
  clearJourneyPost(
    @CurrentUser() u: { id: string },
    @Body() body: JourneyLocationsClearBodyDto,
  ) {
    return this.location.clearByJourney(u.id, body.journeyId);
  }
}
