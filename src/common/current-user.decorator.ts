import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: number;
  role: 'USER' | 'ORG_ADMIN' | 'SUPER_ADMIN';
  institutionId: number | null;
  mfaEnabled: boolean;
  mfaVerified: boolean;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);