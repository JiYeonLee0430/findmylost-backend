import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { decrypt, encrypt } from '../common/crypto.util';

@Injectable()
export class MfaService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  issueLoginResult(user: { id: number; mfaEnabled: boolean }) {
    if (user.mfaEnabled) {
      return {
        mfaRequired: true,
        mfaToken: this.jwt.sign({ sub: user.id, scope: 'mfa-pending' }, { expiresIn: '5m' }),
      };
    }
    return { mfaRequired: false, accessToken: this.jwt.sign({ sub: user.id, mfa: false }) };
  }

  async setup(userId: number) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabled) throw new BadRequestException('이미 MFA가 등록되어 있습니다.');

    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: encrypt(secret) } });

    const otpauthUrl = authenticator.keyuri(user.email, 'LostFound', secret);
    return { otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl) };
  }

  async enable(userId: number, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecret) throw new BadRequestException('먼저 MFA 설정을 시작하세요.');
    if (!authenticator.verify({ token: code, secret: decrypt(user.mfaSecret) })) {
      throw new BadRequestException('인증 코드가 올바르지 않습니다.');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaEnabledAt: new Date() },
    });
    return { accessToken: this.jwt.sign({ sub: userId, mfa: true }) };
  }

  async verifyLogin(mfaToken: string, code: string) {
    let payload: { sub: number; scope?: string };
    try {
      payload = this.jwt.verify(mfaToken);
    } catch {
      throw new UnauthorizedException();
    }
    if (payload.scope !== 'mfa-pending') throw new UnauthorizedException();

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    if (!user.mfaEnabled || !user.mfaSecret) throw new UnauthorizedException();
    if (!authenticator.verify({ token: code, secret: decrypt(user.mfaSecret) })) {
      throw new UnauthorizedException('인증 코드가 올바르지 않습니다.');
    }
    return { accessToken: this.jwt.sign({ sub: user.id, mfa: true }) };
  }
}