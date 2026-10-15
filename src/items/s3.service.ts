import { Injectable } from '@nestjs/common';
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
      { expiresIn: 300 },
    );
    return { key, uploadUrl: url };
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