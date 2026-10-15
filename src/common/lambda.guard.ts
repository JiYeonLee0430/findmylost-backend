import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class LambdaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    // 클라이언트가 보낸 헤더의 시크릿 키 추출
    const lambdaSecret = request.headers['x-lambda-secret'];

    // .env에 저장된 키와 다르면 요청 거절
    if (lambdaSecret !== process.env.LAMBDA_SECRET_KEY) {
      throw new UnauthorizedException('Lambda 전용 시크릿 키가 일치하지 않습니다.');
    }
    return true; // 일치하면 통과
  }
}