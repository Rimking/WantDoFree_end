import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WechatService } from '../../infrastructure/wechat/wechat.service';
import { User } from '../../entities/user.entity';

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
      user = await this.users.save(this.users.create({ openid }));
    }
    const token = this.jwt.sign({ sub: user.id }, { expiresIn: '7d' });
    return {
      token,
      user: {
        ...user,
        nick: user.nick ?? null,
        nickname: user.nick ?? null,
      },
    };
  }
}
