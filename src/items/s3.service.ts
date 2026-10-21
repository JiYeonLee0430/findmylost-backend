import { Injectable } from '@nestjs/common';
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class S3Service {
  private s3 = new S3Client({ region: process.env.AWS_REGION });
  private bucket = process.env.S3_BUCKET!;

  buildKey(itemId: number, filename: string) {
    const safe = filename.replace(/[^\w.\-]/g, '_').slice(-100);
    return `items/${itemId}/${randomUUID()}-${safe}`;
  }

  async createUploadUrl(itemId: number, filename: string, contentType: string) {
    const key = this.buildKey(itemId, filename);
    const url = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: 300 }, // 업로드용은 5분 유효
    );
    return { key, uploadUrl: url };
  }

  /** 비공개 버킷의 사진을 볼 수 있는 임시 URL (1시간) */
  async createDownloadUrl(key: string): Promise<string | null> {
    try {
      return await getSignedUrl(
        this.s3,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: 1800 },
      );
    } catch (e) {
      // AWS 자격 증명이 없는 로컬에서도 목록 조회는 동작하게 함
      console.error('다운로드 URL 생성 실패', e);
      return null;
    }
  }

  async deleteObjects(keys: string[]) {
    if (keys.length === 0) return;
    await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
  }
}