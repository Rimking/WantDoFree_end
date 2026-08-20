import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpsertBudgetDto } from './user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsInt, IsOptional, Min } from 'class-validator';

class BudgetGetBodyDto {
  @IsOptional()
  @IsInt()
  @Min(2000)
  year?: number;
}

/**
 * 我 / 预算 API（新契约：有参一律 POST + body）。
 * 资料更新统一走 /user/profile/update；PATCH/GET 兼容端点已于 2026-08-20 下线。
 */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly user: UserService) {}

  @Get()
  me(@CurrentUser() u: { id: string }) {
    return this.user.getById(u.id);
  }

  @Post('budget/get')
  getBudgetPost(
    @CurrentUser() u: { id: string },
    @Body() body: BudgetGetBodyDto,
  ) {
    return this.user.getBudget(u.id, body.year);
  }

  @Post('budget/update')
  upsertBudgetPost(
    @CurrentUser() u: { id: string },
    @Body() dto: UpsertBudgetDto,
  ) {
    return this.user.upsertBudget(u.id, dto);
  }
}
