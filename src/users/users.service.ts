import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemType, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../items/s3.service';

const SALT_ROUNDS = 10; // ← auth.service.ts에서 쓰는 숫자와 똑같이

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private s3: S3Service) {}

  /** 내 정보 + 내가 쓴 글 개수 */
  async me(userId: number) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, role: true,
        emailVerifiedAt: true, mfaEnabled: true, createdAt: true,
        institution: { select: { id: true, name: true } },
      },
    });
    if (!u) throw new NotFoundException('사용자를 찾을 수 없습니다.');

    const counts = await this.prisma.item.groupBy({
      by: ['type'],
      where: { authorId: userId },
      _count: { _all: true },
    });
    const count = (t: ItemType) => counts.find((c) => c.type === t)?._count._all ?? 0;

    const { emailVerifiedAt, ...rest } = u;
    return {
      ...rest,
      emailVerified: !!emailVerifiedAt,
      stats: { lost: count(ItemType.LOST), found: count(ItemType.FOUND) },
    };
  }

  /** 이름 변경 */
  async updateProfile(userId: number, name: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { name } });
    return this.me(userId);
  }

  /** 현재 비밀번호 확인 (틀리면 400. 401은 프론트가 '로그인 만료'로 오해할 수 있어서 피함) */
  private async checkPassword(userId: number, password: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { password: true, role: true } });
    if (!u) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    if (!u.password) throw new BadRequestException('비밀번호가 설정되지 않은 계정입니다.');
    if (!(await bcrypt.compare(password, u.password))) {
      throw new BadRequestException('비밀번호가 올바르지 않습니다.');
    }
    return u;
  }

  /** 비밀번호 변경 */
  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    await this.checkPassword(userId, currentPassword);
    if (currentPassword === newPassword) {
      throw new BadRequestException('새 비밀번호가 현재 비밀번호와 같습니다.');
    }
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hash } });
    return { ok: true };
  }

  /** 회원 탈퇴: 일반 회원만. 글(사진, 벡터, 대화 포함), 대화, 인증 기록, 계정을 한 번에 삭제 */
  async withdraw(userId: number, password: string) {
    const u = await this.checkPassword(userId, password);
    if (u.role !== Role.USER) {
      throw new BadRequestException('기관 관리자와 운영자 계정은 운영자에게 탈퇴를 요청해 주세요.');
    }

    // S3에서 지울 사진 목록을 먼저 확보 (DB에서 지우면 경로를 알 수 없음)
    const images = await this.prisma.itemImage.findMany({
      where: { item: { authorId: userId } },
      select: { s3Key: true },
    });

    await this.prisma.$transaction([
      this.prisma.item.deleteMany({ where: { authorId: userId } }), // 사진 기록, 벡터, 그 글의 대화도 함께 삭제
      this.prisma.conversation.deleteMany({ where: { OR: [{ starterId: userId }, { ownerId: userId }] } }),
      this.prisma.emailVerificationToken.deleteMany({ where: { userId } }),
      this.prisma.orgVerificationRequest.deleteMany({ where: { userId } }),
      this.prisma.orgVerificationRequest.updateMany({ where: { reviewedById: userId }, data: { reviewedById: null } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);

    try {
      await this.s3.deleteObjects(images.map((i) => i.s3Key));
    } catch (e) {
      console.error(`탈퇴 후 사진 파일 삭제 실패 user=${userId}`, e); // 계정 삭제는 이미 완료
    }
    return { ok: true };
  }
}