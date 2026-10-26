import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: { sub: number; scope?: string; mfa?: boolean }) {
    if (payload.scope === 'mfa-pending') throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();
    return {
      id: user.id,
      role: user.role,
      institutionId: user.institutionId,
      mfaEnabled: user.mfaEnabled,
      mfaVerified: payload.mfa === true,
      emailVerified: !!user.emailVerifiedAt,
    };

    
  }
}