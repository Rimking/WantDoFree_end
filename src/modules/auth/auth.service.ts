import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { WechatService } from '../../infrastructure/wechat/wechat.service';
import { User } from '../../entities/user.entity';
import { maskPhone } from '../user/profile.catalog';
import { toUserResponse } from '../user/user-response';

@Injectable()
export class AuthService {
  constructor(
    private readonly wechat: WechatService,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** 微信 code 换 JWT；首次登录自动建号（openid↔user 映射）。 */
  async wechatLogin(code: string) {
    const { openid } = await this.wechat.code2Session(code);
    let user = await this.users.findOne({ where: { openid } });
    if (!user) {
      // 并发首登会撞 openid 唯一键，失败重查即可
      try {
        user = await this.users.save(this.users.create({ openid }));
      } catch {
        user = await this.users.findOne({ where: { openid } });
      }
    }
    if (!user) throw new Error('user create failed');
    const token = this.jwt.sign({ sub: user.id }, { expiresIn: '7d' });
    // 白名单序列化：禁止整包返回实体（openid/unionid/phone 明文历史上曾泄漏）
    return { token, user: toUserResponse(user) };
  }

  /** 绑定 / 更换手机号：getPhoneNumber code 换号写入当前用户（跨账号占用校验）。 */
  async bindPhone(userId: string, code: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');
    const { phone } = await this.wechat.getPhoneNumber(code);
    const digits = String(phone).replace(/\D/g, '');
    if (!/^1\d{10}$/.test(digits)) {
      throw new BadRequestException({
        code: 'PHONE_INVALID',
        message: '手机号格式不正确',
      });
    }
    const existed = await this.users.findOne({
      where: { phone: digits, id: Not(userId) },
    });
    if (existed) {
      throw new BadRequestException({
        code: 'PHONE_TAKEN',
        message: '该手机号已绑定其他账号',
      });
    }
    user.phone = digits;
    await this.users.save(user);
    return { phoneMasked: maskPhone(digits) };
  }
}
