import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FootprintService } from './footprint.service';
import {
  FootprintDetailBodyDto,
  FootprintStatsBodyDto,
} from './footprint.dto';

/**
 * 我的足迹：数量聚合 + 按类型详情
 * 用户身份取 JWT，勿传 userId
 */
@Controller('footprints')
@UseGuards(JwtAuthGuard)
export class FootprintController {
  constructor(private readonly footprint: FootprintService) {}

  /** 足迹四格数量：旅程 / 城市 / 照片 / 记录 */
  @Post('stats')
  stats(
    @CurrentUser() u: { id: string },
    @Body() _body: FootprintStatsBodyDto,
  ) {
    return this.footprint.stats(u.id);
  }

  /**
   * 查看全部：必传 type 枚举，一次只返回该类目
   * FootprintType: 1旅程 2城市 3照片 4记录
   */
  @Post('detail')
  detail(
    @CurrentUser() u: { id: string },
    @Body() body: FootprintDetailBodyDto,
  ) {
    return this.footprint.detail(u.id, body);
  }
}
