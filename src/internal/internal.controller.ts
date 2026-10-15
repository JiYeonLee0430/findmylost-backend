import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { LambdaGuard } from '../common/lambda.guard';

@Controller('internal')
export class InternalController {
  
  // 요청한 주소: POST /internal/items/{id}/embedding
  @Post('items/:id/embedding')
  @UseGuards(LambdaGuard) // 시크릿 키 검사 미들웨어 통과 필수
  async updateEmbedding(
    @Param('id') id: string, 
    @Body() body: { embedding: number[] }
  ) {
    const itemId = parseInt(id, 10);
    
    // TODO: 나중에 Prisma 연동해서 pgvector DB에 저장하는 로직 들어갈 자리
    console.log(`Lambda로부터 아이템 ${itemId}의 임베딩(벡터) 데이터를 수신했습니다.`);
    
    return { 
      success: true, 
      message: `아이템 ${itemId}의 임베딩 데이터가 안전하게 수신되었습니다.` 
    };
  }
}