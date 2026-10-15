import * as crypto from 'crypto';

// .env에 저장해둔 64자리 키를 가져오는 함수
const getEncryptionKey = () => {
  const key = process.env.MFA_ENC_KEY;
  if (!key || key.length !== 64) {
    throw new Error('MFA_ENC_KEY가 없거나 길이가 올바르지 않습니다.');
  }
  return Buffer.from(key, 'hex');
};

const ALGORITHM = 'aes-256-gcm';

// 텍스트 암호화 함수
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

// 텍스트 복호화 함수 (나중에 로그인할 때 사용)
export function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('암호화된 텍스트 형식이 잘못되었습니다.');
  }
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}