import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24시간
const COOLDOWN_MS = 60 * 1000;            // 재발송 간격 60초

@Injectable()
export class EmailVerificationService {
  private logger = new Logger(EmailVerificationService.name);

  constructor(private prisma: PrismaService, private mail: MailService) {}

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  /** 토큰 발급 + 메일 발송. 이미 인증됐거나 쿨다운 중이면 조용히 무시 */
  async issueAndSend(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerifiedAt) return;

    const recent = await this.prisma.emailVerificationToken.findFirst({
      where: { userId, createdAt: { gt: new Date(Date.now() - COOLDOWN_MS) } },
    });
    if (recent) return;

    const token = randomBytes(32).toString('hex');
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.deleteMany({ where: { userId, usedAt: null } }),
      this.prisma.emailVerificationToken.create({
        data: { userId, tokenHash: this.hash(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
      }),
    ]);

    const link = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
    const text = `${user.name}님, 아래 링크를 눌러 이메일 인증을 완료해주세요. (24시간 유효)\n${link}\n\n본인이 요청하지 않았다면 이 메일을 무시하세요.`;
    const html = `<p>${user.name}님, 아래 버튼을 눌러 이메일 인증을 완료해주세요. (24시간 유효)</p>
<p><a href="${link}">이메일 인증하기</a></p>
<p>본인이 요청하지 않았다면 이 메일을 무시하세요.</p>`;

    await this.mail.send(user.email, '[분실물 찾기] 이메일 인증을 완료해주세요', html, text);
  }

  /** 이메일로 재발송 (계정 존재 여부를 숨기려고 항상 성공처럼 응답) */
  async resendByEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      await this.issueAndSend(user.id).catch((e) => this.logger.error('인증 메일 재발송 실패', e));
    }
    return { ok: true };
  }

  async verify(token: string) {
    const invalid = new BadRequestException('유효하지 않거나 만료된 인증 링크입니다.');
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) throw invalid;

    await this.prisma.$transaction(async (tx) => {
      // 동시에 두 번 눌러도 한 번만 성공하도록 조건부 업데이트
      const used = await tx.emailVerificationToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count === 0) throw invalid;
      await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
    });
    return { ok: true };
  }
}