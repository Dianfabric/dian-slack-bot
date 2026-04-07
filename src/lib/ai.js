import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * 디안 원단 전문가 시스템 프롬프트
 */
const DIAN_SYSTEM_PROMPT = `너는 프리미엄 인테리어 원단 유통 전문 기업 '디안(Dian)'의 AI 어시스턴트 '디안봇'이야.

## 역할
- 원단 재고 조회, 주문/견적 관리, 원단 추천을 담당
- 인테리어 디자이너, 공간 디자이너, 가구 제작 업체 등 전문가를 위한 파트너
- 세련되고 신뢰감 있는 전문가 어조 유지

## 취급 품목
- 가구용 원단: 쇼파, 스툴 등 (내구성, 터치감 중요)
- 벽면용 원단: 벽패널 최적화 (심미성, 흡음성)
- 소품용 원단: 쿠션, 베딩 등 감각적 소재
- 윈도우 트리트먼트: 커튼, 블라인드용 드레이프성 원단

## 전문 지식
- Martindale 내구성 수치, 방오/방수 기능, 방염 성능
- 원단 성분(Polyester, Cotton, Linen 등), 중량(GSM), 폭
- 인테리어 트렌드: 미드센추리 모던, 재팬디, 미니멀 등

## 응답 규칙
1. 구글 시트 데이터가 제공되면 그 데이터를 기반으로 정확하게 답변
2. 데이터가 없는 질문은 일반적인 원단 전문 지식으로 답변
3. 재고 조회 시 수량, 컬러, 단가를 명확하게 표시
4. 견적 요청 시 원단명, 수량, 단가, 합계를 정리
5. 슬랙 메시지에 맞게 간결하게 답변 (너무 길지 않게)
6. 한국어로 답변`;

/**
 * Claude AI에 질문하기 (Haiku - 빠르고 저렴한 모델)
 * 단순 재고 조회, 간단한 질문에 사용
 */
export async function askHaiku(userMessage, context = '') {
  const messages = [
    {
      role: 'user',
      content: context
        ? `[참고 데이터]\n${context}\n\n[질문]\n${userMessage}`
        : userMessage,
    },
  ];

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: DIAN_SYSTEM_PROMPT,
    messages,
  });

  return response.content[0].text;
}

/**
 * Claude AI에 질문하기 (Sonnet - 고품질 모델)
 * 견적서 작성, 복잡한 분석, 원단 추천에 사용
 */
export async function askSonnet(userMessage, context = '') {
  const messages = [
    {
      role: 'user',
      content: context
        ? `[참고 데이터]\n${context}\n\n[질문]\n${userMessage}`
        : userMessage,
    },
  ];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: DIAN_SYSTEM_PROMPT,
    messages,
  });

  return response.content[0].text;
}

/**
 * 질문 유형에 따라 적절한 모델 선택
 */
export async function askDianBot(userMessage, context = '') {
  // 견적, 추천, 분석 등 복잡한 요청은 Sonnet
  const complexKeywords = ['견적', '추천', '분석', '비교', '제안', '보고서', '리포트', '요약'];
  const isComplex = complexKeywords.some(kw => userMessage.includes(kw));

  if (isComplex) {
    return askSonnet(userMessage, context);
  }

  // 그 외 단순 조회는 Haiku
  return askHaiku(userMessage, context);
}
