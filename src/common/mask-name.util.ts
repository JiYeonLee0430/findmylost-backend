const SURNAMES = new Set(
    '김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용'.split(''),
  );
  const ITEM_WORDS = '님|지갑|학생증|신분증|주민등록증|면허증|카드|여권|통장|명함|증명서|사원증|증';
  const RE = new RegExp(`(?<![가-힣])([가-힣]{3})(?=\\s*(?:${ITEM_WORDS}))`, 'g');
  
  /** "이정준 지갑" → "이*준 지갑". 성씨로 시작하는 3글자 + 신분/지갑류 단어 앞일 때만 가림 (최선 노력) */
  export function maskNames(text?: string | null): string | null {
    if (!text) return text ?? null;
    return text.replace(RE, (m) => (SURNAMES.has(m[0]) ? `${m[0]}*${m[2]}` : m));
  }