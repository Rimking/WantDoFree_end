import { NestFactory } from '@nestjs/core';
import {
  BadRequestException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { isProd } from './common/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const prod = isProd();

  app.setGlobalPrefix('dream');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: () =>
        new BadRequestException({
          code: '40001',
          message: '参数错误',
        }),
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const corsOrigin = process.env.CORS_ORIGIN;
  if (prod) {
    if (!corsOrigin || corsOrigin === '*') {
      // eslint-disable-next-line no-console
      console.warn(
        '⚠️ 生产环境建议设置 CORS_ORIGIN 白名单；当前未配置将拒绝跨域',
      );
      app.enableCors({ origin: false });
    } else {
      app.enableCors({
        origin: corsOrigin.split(',').map((s) => s.trim()),
        credentials: true,
      });
    }
  } else {
    app.enableCors({
      origin: corsOrigin
        ? corsOrigin.split(',').map((s) => s.trim())
        : true,
      credentials: true,
    });
  }

  if (!prod) {
    const doc = new DocumentBuilder()
      .setTitle('途记 API')
      .setVersion('1')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'dream/docs',
      app,
      SwaggerModule.createDocument(app, doc),
    );
  }

  await app.listen(process.env.PORT ?? 3000);
  // eslint-disable-next-line no-console
  console.log(
    `🚀 途记后端已启动: http://localhost:${process.env.PORT ?? 3000}${prod ? '' : '/dream/docs'}  [STORAGE_DRIVER=${process.env.STORAGE_DRIVER || 'local'}]`,
  );
}

bootstrap().catch((err) => {
  // 启动期异常（JWT_SECRET 缺失、DB 连不上等）必须清晰退出，而非静默 unhandled rejection
  console.error('❌ 启动失败:', err?.message ?? err);
  process.exit(1);
});
