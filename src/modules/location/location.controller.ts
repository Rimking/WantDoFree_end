import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { LocationService } from './location.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class JourneyLocationsClearBodyDto {
  @IsString()
  @Length(1, 64)
  journeyId: string;
}

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

  @Delete('me/locations')
  clearMine(@CurrentUser() u: { id: string }) {
    return this.location.clearByUser(u.id);
  }

  @Delete('journeys/:id/locations')
  clearJourney(@CurrentUser() u: { id: string }, @Param('id') id: string) {
    return this.location.clearByJourney(u.id, id);
  }
}
