import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '1mb' });
  app.set('trust proxy', 2); // 사용자 → CloudFront → nginx → Node: 오른쪽에서 2칸 건너뛴 값이 사용자 IP

  // 1. CORS 허용 (프론트엔드 로컬 개발 포트 허용)
  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  });
  
  app.setGlobalPrefix('api');

  // DTO 검증 활성화 (이게 없으면 @IsEmail, @MinLength 등이 동작하지 않음)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTO에 없는 필드는 제거
      transform: true, // 요청 값을 DTO 타입으로 변환
    }),
  );

  // Swagger 문서 설정
  const config = new DocumentBuilder()
    .setTitle('Lost & Found API 명세서')
    .setDescription('대학교 분실물 서비스 백엔드 API 및 테스트 페이지입니다.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT || 3000);
}
bootstrap();