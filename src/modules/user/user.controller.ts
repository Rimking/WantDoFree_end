import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateProfileDto, UpsertBudgetDto } from './user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsInt, IsOptional, Min } from 'class-validator';

class BudgetGetBodyDto {
  @IsOptional()
  @IsInt()
  @Min(2000)
  year?: number;
}

@Controller('me')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly user: UserService) {}

  @Get()
  me(@CurrentUser() u: { id: string }) {
    return this.user.getById(u.id);
  }

  @Post('update')
  updatePost(
    @CurrentUser() u: { id: string },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.user.updateProfile(u.id, dto);
  }

  @Patch()
  update(@CurrentUser() u: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.user.updateProfile(u.id, dto);
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

  @Get('budget')
  getBudget(
    @CurrentUser() u: { id: string },
    @Query('year') year?: string,
  ) {
    return this.user.getBudget(u.id, year ? Number(year) : undefined);
  }

  @Patch('budget')
  upsertBudget(
    @CurrentUser() u: { id: string },
    @Body() dto: UpsertBudgetDto,
  ) {
    return this.user.upsertBudget(u.id, dto);
  }
}
