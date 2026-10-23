import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const EMBEDDING_DIM = 1024;

@Injectable()
export class BedrockService {
  private logger = new Logger(BedrockService.name);
  private client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
  // Lambda와 반드시 같은 모델이어야 비교가 됩니다 (서버에 BEDROCK_MODEL_ID는 넣지 않기로 했으니 기본값이 사용됨)
  private modelId = process.env.BEDROCK_MODEL_ID ?? 'amazon.titan-embed-image-v1';

  async embedImage(image: Buffer): Promise<number[]> {
    try {
      const res = await this.client.send(
        new InvokeModelCommand({
          modelId: this.modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            inputImage: image.toString('base64'),
            embeddingConfig: { outputEmbeddingLength: EMBEDDING_DIM },
          }),
        }),
      );
      const json = JSON.parse(new TextDecoder().decode(res.body));
      const embedding = json.embedding;
      if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIM) {
        throw new Error(`예상과 다른 임베딩 응답 (길이 ${Array.isArray(embedding) ? embedding.length : 'N/A'})`);
      }
      return embedding;
    } catch (e) {
      // 사진 내용은 로그에 남기지 않고 오류 종류만 기록
      this.logger.error(`Bedrock 임베딩 실패: ${e instanceof Error ? `${e.name}: ${e.message}` : 'unknown'}`);
      throw new ServiceUnavailableException('이미지 분석에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  }
}