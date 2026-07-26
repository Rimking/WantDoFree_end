import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DestinationService } from './destination.service';
import {
  CreateDestinationDto,
  DestinationCreateBodyDto,
  DestinationIdBodyDto,
  DestinationJourneyIdBodyDto,
  DestinationReorderBodyDto,
  DestinationUpdateBodyDto,
  PatchDestinationDto,
  ReorderDestinationsDto,
} from './destination.dto';

@Controller('journeys')
@UseGuards(JwtAuthGuard)
export class DestinationJourneyController {
  constructor(private readonly destination: DestinationService) {}

  // ─── 新契约 POST（静态路径）──────────────────────────────

  @Post('destinations/list')
  listPost(
    @CurrentUser() u: { id: string },
    @Body() body: DestinationJourneyIdBodyDto,
  ) {
    return this.destination.list(u.id, body.journeyId);
  }

  @Post('destinations/create')
  createPost(
    @CurrentUser() u: { id: string },
    @Body() body: DestinationCreateBodyDto,
  ) {
    const { journeyId, ...dto } = body;
    return this.destination.create(u.id, journeyId, dto);
  }

  @Post('destinations/reorder')
  @HttpCode(204)
  reorderPost(
    @CurrentUser() u: { id: string },
    @Body() body: DestinationReorderBodyDto,
  ) {
    const { journeyId, ...dto } = body;
    return this.destination.reorder(u.id, journeyId, dto);
  }

  // ─── 兼容 path ───────────────────────────────────────────

  @Get(':journeyId/destinations')
  list(
    @CurrentUser() u: { id: string },
    @Param('journeyId') journeyId: string,
  ) {
    return this.destination.list(u.id, journeyId);
  }

  @Post(':journeyId/destinations')
  create(
    @CurrentUser() u: { id: string },
    @Param('journeyId') journeyId: string,
    @Body() dto: CreateDestinationDto,
  ) {
    return this.destination.create(u.id, journeyId, dto);
  }

  @Patch(':journeyId/destinations/reorder')
  @HttpCode(204)
  reorder(
    @CurrentUser() u: { id: string },
    @Param('journeyId') journeyId: string,
    @Body() dto: ReorderDestinationsDto,
  ) {
    return this.destination.reorder(u.id, journeyId, dto);
  }
}

@Controller('destinations')
@UseGuards(JwtAuthGuard)
export class DestinationController {
  constructor(private readonly destination: DestinationService) {}

  @Post('update')
  updatePost(
    @CurrentUser() u: { id: string },
    @Body() body: DestinationUpdateBodyDto,
  ) {
    const { id, ...dto } = body;
    return this.destination.patch(u.id, id, dto);
  }

  @Post('delete')
  @HttpCode(204)
  deletePost(
    @CurrentUser() u: { id: string },
    @Body() body: DestinationIdBodyDto,
  ) {
    return this.destination.softDelete(u.id, body.id);
  }

  @Patch(':destinationId')
  patch(
    @CurrentUser() u: { id: string },
    @Param('destinationId') destinationId: string,
    @Body() dto: PatchDestinationDto,
  ) {
    return this.destination.patch(u.id, destinationId, dto);
  }

  @Delete(':destinationId')
  @HttpCode(204)
  remove(
    @CurrentUser() u: { id: string },
    @Param('destinationId') destinationId: string,
  ) {
    return this.destination.softDelete(u.id, destinationId);
  }
}
