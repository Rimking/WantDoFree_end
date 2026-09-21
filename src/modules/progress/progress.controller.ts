import { Body, Controller, Get, Header, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ProgressService } from './progress.service';
import { AcknowledgeLevelDto } from './progress.dto';

@Controller('progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get('overview')
  @Header('Cache-Control', 'no-store')
  overview(@CurrentUser() user: { id: string }) {
    return this.progress.overview(user.id);
  }

  @Post('ack-level')
  acknowledge(
    @CurrentUser() user: { id: string },
    @Body() body: AcknowledgeLevelDto,
  ) {
    return this.progress.acknowledge(user.id, body.level);
  }
}
