import { Module } from '@nestjs/common';
import { MemberBenefitService } from './member-benefit.service';

/**
 * 会员权益联动共享服务模块（T3.3）。
 * 仅提供 MemberBenefitService 并导出，供 membership / user / quota 等模块注入复用。
 */
@Module({
  providers: [MemberBenefitService],
  exports: [MemberBenefitService],
})
export class MemberBenefitModule {}
