import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InviteService } from './invite.service';

class InviteAcceptDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}

@Controller('invite')
@UseGuards(JwtAuthGuard)
export class InviteController {
  constructor(private readonly invite: InviteService) {}

  @Get('code')
  code(@CurrentUser() u: { id: string }) {
    return this.invite.getOrCreateCode(u.id);
  }

  @Get('stats')
  stats(@CurrentUser() u: { id: string }) {
    return this.invite.getStats(u.id);
  }

  @Post('accept')
  accept(
    @CurrentUser() u: { id: string },
    @Body() body: InviteAcceptDto,
  ) {
    return this.invite.accept(u.id, body.code);
  }
}
