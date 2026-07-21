/**
 * Paylaşılan Anthropic (Claude) client singleton.
 * Yalnızca server-side import edilir.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getEnv } from '@/lib/env';
import { TIMEOUTS } from '@/lib/async/timeout';

// CLAUDE.md varsayılanı: en yetenekli model. (claude-api skill referansı)
export const CLAUDE_MODEL = 'claude-opus-4-8';

let _client: Anthropic | undefined;

export function anthropic(): Anthropic {
  if (!_client) {
    const apiKey = getEnv().ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY tanımlı değil — Claude çağrıları yapılamaz.');
    // timeout: SDK isteği kendisi iptal eder (soket kapanır); asılı kalan bir vision çağrısı
    // pipeline adımını sonsuza kadar `generating_seo`'da tutmasın diye.
    _client = new Anthropic({ apiKey, timeout: TIMEOUTS.claude, maxRetries: 2 });
  }
  return _client;
}
