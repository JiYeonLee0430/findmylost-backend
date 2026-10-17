import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MfaService } from './mfa.service';
import { EmailVerificationService } from './email-verification.service';
import { LoginDto, SignupDto } from './auth.dto';

@Injectable()
export class AuthService {
  private logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private mfa: MfaService,
    private emailVerification: EmailVerificationService,
  ) {}

  async signup(dto: SignupDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('이미 가입된 이메일입니다.');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: await bcrypt.hash(dto.password, 10),
      },
    });

    // 인증 메일 발송 (실패해도 가입은 그대로 성공, 응답을 기다리지 않음)
    this.emailVerification
      .issueAndSend(user.id)
      .catch((e) => this.logger.error('인증 메일 발송 실패', e));

    return { id: user.id, email: user.email, name: user.name };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.password || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    return { ...this.mfa.issueLoginResult(user), emailVerified: !!user.emailVerifiedAt };
  }
}