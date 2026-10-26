import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';

@Injectable()
export class InstitutionsService {
  constructor(private prisma: PrismaService) {}

  listInstitutions() {
    return this.prisma.institution.findMany({
      select: { id: true, name: true, domain: true },
      orderBy: { name: 'asc' },
    });
  }

  async requestVerification(user: AuthUser, institutionId: number, evidence?: string) {
    if (user.role !== Role.USER) throw new ConflictException('이미 기관 권한이 있습니다.');
    if (!user.mfaEnabled) throw new ForbiddenException('기관 인증 신청 전에 MFA를 먼저 등록해주세요.');
    if (!user.emailVerified) throw new ForbiddenException('기관 인증 신청 전에 이메일 인증을 완료해주세요.');

    const inst = await this.prisma.institution.findUnique({ where: { id: institutionId } });
    if (!inst) throw new NotFoundException('기관을 찾을 수 없습니다.');

    const pending = await this.prisma.orgVerificationRequest.findFirst({
      where: { userId: user.id, status: VerificationStatus.PENDING },
    });
    if (pending) throw new ConflictException('이미 심사 중인 신청이 있습니다.');

    return this.prisma.orgVerificationRequest.create({
      data: { userId: user.id, institutionId, evidence },
    });
  }

  /** 이메일 도메인이 기관 도메인과 같거나 그 하위 도메인이면 true (evilkornu.ac.kr 같은 비슷한 주소는 제외) */
  private matchesDomain(email: string, institutionDomain: string | null) {
    if (!institutionDomain) return false;
    const domain = email.split('@')[1]?.toLowerCase();
    const inst = institutionDomain.toLowerCase();
    return !!domain && (domain === inst || domain.endsWith(`.${inst}`));
  }

  async listPending() {
    const rows = await this.prisma.orgVerificationRequest.findMany({
      where: { status: VerificationStatus.PENDING },
      include: {
        user: { select: { id: true, email: true, name: true, emailVerifiedAt: true } },
        institution: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((r) => ({
      id: r.id,
      evidence: r.evidence,
      createdAt: r.createdAt,
      institution: r.institution,
      user: { id: r.user.id, email: r.user.email, name: r.user.name },
      emailVerified: !!r.user.emailVerifiedAt,
      // 인증된 이메일의 도메인이 기관 도메인과 같을 때만 true (참고용, 자동 승인 근거가 아님)
      domainMatched: !!r.user.emailVerifiedAt && this.matchesDomain(r.user.email, r.institution.domain),
    }));
  }

  async approve(requestId: number, reviewerId: number) {
    const req = await this.prisma.orgVerificationRequest.findUnique({ where: { id: requestId } });
    if (!req || req.status !== VerificationStatus.PENDING) throw new BadRequestException('처리할 수 없는 신청입니다.');

    const applicant = await this.prisma.user.findUnique({ where: { id: req.userId } });
    if (!applicant?.emailVerifiedAt) throw new BadRequestException('신청자의 이메일 인증이 완료되지 않았습니다.');

    await this.prisma.$transaction([
      this.prisma.orgVerificationRequest.update({
        where: { id: requestId },
        data: { status: VerificationStatus.APPROVED, reviewedById: reviewerId, reviewedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: req.userId },
        data: { role: Role.ORG_ADMIN, institutionId: req.institutionId },
      }),
    ]);
    return { ok: true };
  }

  async reject(requestId: number, reviewerId: number) {
    const req = await this.prisma.orgVerificationRequest.findUnique({ where: { id: requestId } });
    if (!req || req.status !== VerificationStatus.PENDING) throw new BadRequestException('처리할 수 없는 신청입니다.');
    await this.prisma.orgVerificationRequest.update({
      where: { id: requestId },
      data: { status: VerificationStatus.REJECTED, reviewedById: reviewerId, reviewedAt: new Date() },
    });
    return { ok: true };
  }
}