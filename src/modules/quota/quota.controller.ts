import { Controller, Get, UseGuards } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class QuotaController {
  constructor(private readonly quota: QuotaService) {}

  @Get('quota')
  status(@CurrentUser() u: { id: string }) {
    return this.quota.getStatus(u.id);
  }
}
