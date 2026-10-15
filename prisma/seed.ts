import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { encrypt } from '../src/common/crypto.util';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 시드 데이터 주입을 시작합니다...');

  // 시연용 임시 비밀번호 (로그인 로직과 같은 방식으로 해시)
  const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD ?? 'password123', 10);

  // MFA 설정: SEED_MFA=true 면 미리 켜둠(B), 아니면 꺼둠(A: API로 직접 등록)
  const useSeedMfa = process.env.SEED_MFA === 'true';
  let mfaFields: { mfaEnabled: boolean; mfaSecret: string | null; mfaEnabledAt: Date | null };

  if (useSeedMfa) {
    const secret = process.env.SEED_MFA_SECRET;
    if (!secret) throw new Error('SEED_MFA=true 인데 SEED_MFA_SECRET이 없습니다.');
    if (!/^[0-9a-fA-F]{64}$/.test(process.env.MFA_ENC_KEY ?? '')) {
      throw new Error('MFA_ENC_KEY는 64자리 hex여야 합니다. (openssl rand -hex 32)');
    }
    mfaFields = { mfaEnabled: true, mfaSecret: encrypt(secret), mfaEnabledAt: new Date() };
  } else {
    mfaFields = { mfaEnabled: false, mfaSecret: null, mfaEnabledAt: null };
  }

  // 1. 기관 (upsert: 여러 번 실행해도 안전)
  const nazareth = await prisma.institution.upsert({
    where: { name: '나사렛대학교' },
    update: {},
    create: { name: '나사렛대학교', domain: 'kornu.ac.kr' },
  });

  const sangmyung = await prisma.institution.upsert({
    where: { name: '상명대학교' },
    update: {},
    create: { name: '상명대학교', domain: 'smu.ac.kr' },
  });
  console.log('✅ 대학교 기관 데이터 생성 완료!');

  // 2. 기관 관리자 (ORG_ADMIN)
  const orgAdmins = [
    { email: 'admin@kornu.ac.kr', name: '나사렛대 관리자', institutionId: nazareth.id },
    { email: 'admin@smu.ac.kr', name: '상명대 관리자', institutionId: sangmyung.id },
  ];
  for (const a of orgAdmins) {
    await prisma.user.upsert({
      where: { email: a.email },
      update: { ...mfaFields }, // 이미 있는 계정도 MFA 상태 갱신
      create: { ...a, password: passwordHash, role: Role.ORG_ADMIN, ...mfaFields },
    });
  }

  // 3. 서비스 운영자 (기관 인증 신청 승인용)
  await prisma.user.upsert({
    where: { email: 'superadmin@lostfound.com' },
    update: { ...mfaFields },
    create: {
      email: 'superadmin@lostfound.com',
      password: passwordHash,
      name: '서비스 운영자',
      role: Role.SUPER_ADMIN,
      ...mfaFields,
    },
  });

  // 4. 일반 사용자 (기관 인증 신청 시연용, MFA는 일부러 꺼둠)
  await prisma.user.upsert({
    where: { email: 'user@test.com' },
    update: {},
    create: {
      email: 'user@test.com',
      password: passwordHash,
      name: '일반 사용자',
      role: Role.USER,
    },
  });

  console.log(`✅ 계정 생성 완료! (MFA 시드: ${useSeedMfa ? 'ON' : 'OFF'})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });