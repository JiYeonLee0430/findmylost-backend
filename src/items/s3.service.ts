import { Injectable } from '@nestjs/common';
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

//  같은 사진의 주소를 재사용해 브라우저가 저장해 둔 사진을 쓰게 한다
const URL_TTL_SEC = 40 * 60; // 주소 유효 시간 (40분)
const REUSE_MS = 20 * 60 * 1000; // 이 시간 동안 같은 주소를 재사용 (20분)
const urlCache = new Map<string, { url: string; reuseUntil: number }>();

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

  //비공개 버킷의 사진을 볼 수 있는 임시 URL. 20분간 같은 주소를 재사용해 브라우저 캐시가 동작하게 함 */
  async createDownloadUrl(key: string): Promise<string | null> {
    //  재사용 기간이 남은 주소가 있으면 그대로 돌려줌
    const now = Date.now();
    const cached = urlCache.get(key);
    if (cached && cached.reuseUntil > now) return cached.url;

    try {
      const url = await getSignedUrl(
        this.s3,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseCacheControl: 'private, max-age=1200', //  브라우저가 20분간 저장
        }),
        { expiresIn: URL_TTL_SEC },
      );
      //  오래된 항목 정리 (메모리가 계속 늘지 않게)
      if (urlCache.size > 5000) {
        for (const [k, v] of urlCache) if (v.reuseUntil <= now) urlCache.delete(k);
      }
      urlCache.set(key, { url, reuseUntil: now + REUSE_MS });
      return url;
    } catch (e) {
      // AWS 자격 증명이 없는 로컬에서도 목록 조회는 동작하게 함
      console.error('다운로드 URL 생성 실패', e);
      return null;
    }
  }

  async deleteObjects(keys: string[]) {
    if (keys.length === 0) return;
    keys.forEach((k) => urlCache.delete(k)); //  삭제된 사진의 주소는 더 쓰지 않음
    await this.s3.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
  }
}