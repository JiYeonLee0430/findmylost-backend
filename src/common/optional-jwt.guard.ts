import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** 토큰이 있으면 req.user를 채우고, 없거나 잘못돼도 통과시킴 (비로그인 조회용) */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(_err: unknown, user: any) {
    return user || null;
  }
}