import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const isProd = process.env.NODE_ENV === 'production';

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const corsOrigin = process.env.CORS_ORIGIN;
  if (isProd) {
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

  if (!isProd) {
    const doc = new DocumentBuilder()
      .setTitle('途记 API')
      .setVersion('1')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, doc),
    );
  }

  await app.listen(process.env.PORT ?? 3000);
  // eslint-disable-next-line no-console
  console.log(
    `🚀 途记后端已启动: http://localhost:${process.env.PORT ?? 3000}${isProd ? '' : '/api/docs'}  [STORAGE_DRIVER=${process.env.STORAGE_DRIVER || 'local'}]`,
  );
}

bootstrap();
