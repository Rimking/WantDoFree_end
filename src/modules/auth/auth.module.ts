import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../../entities/user.entity';
import { WechatModule } from '../../infrastructure/wechat/wechat.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    WechatModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (c: ConfigService) => {
        // 密钥缺失直接启动失败：回落默认值等于把签名密钥公开在源码里
        const secret = c.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET 未配置：拒绝以默认密钥启动（防伪造 token）');
        }
        return {
          secret,
          signOptions: { expiresIn: c.get('JWT_EXPIRES_IN') || '7d' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
