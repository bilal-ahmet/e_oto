/**
 * Yayın öncesi kural kontrollerinin çevrimdışı doğrulaması — `npx tsx scripts/check-rules.ts`.
 *
 * Test altyapısı yok (CLAUDE.md); bu betik ağ çağrısı yapmadan, SENTETİK girdilerle:
 *  - 15 Ekim'deki iki Etsy 400'ünün (`title: all_caps`, `materials: invalid_characters`)
 *    eşdeğerini üretir ve `toEtsySafe` + `validateListingSeo`'nun bunları göndermeden önce
 *    yakaladığını/düzelttiğini gösterir (gerçek ilan verisi KULLANILMAZ);
 *  - uzunluk/adet/fiziksel materyal/AI beyanı ihlallerinin alan + sebeple raporlandığını;
 *  - paket doğrulamasının yanlış oran, aynı içerik ve eksik dosyayı reddettiğini gösterir.
 * Bir kontrol beklenenden farklıysa çıkış kodu 1'dir.
 */

import { sharp } from '../src/lib/image/sharp';
import { toEtsySafe, validateListingSeo, AI_DISCLOSURE_TEXT } from '../src/lib/etsy/text-rules';
import { PackageValidator, assertFileKeys } from '../src/lib/packaging/validate';
import { planUpscale } from '../src/lib/upscale/plan';
import type { DigitalFileSpec } from '../src/lib/product/config';
import type { SeoData } from '../src/types';

let failed = 0;
function expect(name: string, ok: boolean, detail?: unknown): void {
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  if (!ok) failed++;
}

function seo(patch: Partial<SeoData>): SeoData {
  return {
    title: 'Boho Abstract Arch Print | Terracotta Wall Art | Minimalist Digital Download',
    hook: 'Boho abstract arch print.',
    perfectFor: ['Boho Decor'],
    tags: ['boho wall art', 'arch print'],
    description: `Hook.\n\n✦ HOW THIS WAS MADE\n${AI_DISCLOSURE_TEXT}`,
    materials: ['Digital download', 'JPG file'],
    categoryId: '',
    attributes: { orientation: 'Vertical', style: '', occasion: '', room: '', subject: '' },
    ...patch,
  };
}

const fields = (s: SeoData) => validateListingSeo(toEtsySafe(s)).map((i) => i.field);

// ── 1) Tarihsel 400'lerin eşdeğeri (sentetik) ───────────────────────────────
{
  const capsTitle = 'CHRISTMAS TREE WALL ART | HD JPG TV DIGITAL PRINT';
  const fixed = toEtsySafe(seo({ title: capsTitle }));
  expect('all_caps: düzeltilmemiş başlık ihlal olarak raporlanır', validateListingSeo(seo({ title: capsTitle })).some((i) => i.field === 'title'));
  expect('all_caps: toEtsySafe sonrası başlık geçer', !fields(seo({ title: capsTitle })).includes('title'), fixed.title);

  const badMaterials = ['Hi-res JPG', 'Digital/Printable', 'RGB: 300 DPI'];
  expect('invalid_characters: ham materyal ihlal olarak raporlanır', validateListingSeo(seo({ materials: badMaterials })).some((i) => i.field === 'materials'));
  expect('invalid_characters: toEtsySafe sonrası materyaller geçer', !fields(seo({ materials: badMaterials })).includes('materials'), toEtsySafe(seo({ materials: badMaterials })).materials);
}

// ── 2) Otomatik düzeltilemeyenler: alan + sebep, gönderim engellenir ─────────
expect('141 karakterlik başlık reddedilir', fields(seo({ title: 'A'.repeat(1) + 'b'.repeat(140) })).includes('title'));
expect('14 etiket reddedilir', fields(seo({ tags: Array.from({ length: 14 }, (_, i) => `tag ${i}`) })).includes('tags'));
expect('"Canvas print" materyali reddedilir', fields(seo({ materials: ['Digital download', 'Canvas print'] })).includes('materials'));
expect('"PDF file" materyali reddedilir', fields(seo({ materials: ['PDF file'] })).includes('materials'));
expect('"Frame TV art" materyali GEÇER (ekran adı, çerçeve vaadi değil)', !fields(seo({ materials: ['Frame TV art'] })).includes('materials'));
expect('AI beyanı olmayan açıklama reddedilir', fields(seo({ description: 'Nice print. Instant download.' })).includes('description'));
expect('"&" iki kez: toEtsySafe ikinciyi "and" yapar ve geçer', !fields(seo({ title: 'Rust & Sage | Boho & Calm Wall Art' })).includes('title'));
expect('Emoji içeren başlık temizlenip geçer', !fields(seo({ title: 'Christmas Tree 🎄 Wall Art' })).includes('title'));
expect('Düzgün SEO hiç ihlal üretmez', validateListingSeo(toEtsySafe(seo({}))).length === 0, validateListingSeo(toEtsySafe(seo({}))));

// ── 2b) Upscale planı (clarity MP başına ücretlendirir — tavan 17 MP) ─────────
{
  const print = [{ width: 7200, height: 10800 }, { width: 7500, height: 10500 }];
  const tv = [{ width: 3840, height: 2160 }, { width: 1920, height: 1080 }];
  const cases: [string, number, number, typeof print, number][] = [
    ['FLUX baskı 880×1184 → ×4 (16.7 MP, bugünkü kalite)', 880, 1184, print, 4],
    ['FLUX TV 1392×784 → ×3 (4K için yeterli)', 1392, 784, tv, 3],
    ['Imagen 896×1280 → ×3', 896, 1280, print, 3],
    ['Taslak 2048×2730 → atla (×2 bile 22 MP)', 2048, 2730, print, 0],
    ['Taslak 4000×5333 → atla', 4000, 5333, print, 0],
    ['TV taslağı 3840×2160 → atla (zaten hedefte)', 3840, 2160, tv, 0],
  ];
  for (const [name, w, h, targets, want] of cases) {
    const p = planUpscale(w, h, targets, 17);
    // Atlanan durumda AI çıktısı yok (maliyet $0) — tavan yalnız gerçekten büyütülen çıktıya uygulanır.
    expect(`upscale: ${name}`, p.factor === want && (p.factor === 0 || p.outMp <= 17), { factor: p.factor, outMp: p.outMp.toFixed(1), skip: p.skipReason });
  }
}

// ── 3) Paket doğrulaması (yerel sahte dosyalar) ──────────────────────────────
async function jpeg(w: number, h: number, color: string): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg().toBuffer();
}

async function rejects(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    expect(name, false, 'hata beklenirdi');
  } catch (e) {
    expect(name, true);
    console.log(`    ↳ ${e instanceof Error ? e.message : e}`);
  }
}

async function main(): Promise<void> {
  const specs: DigitalFileSpec[] = [
    { key: 'ratio_4x5', label: '4:5', fileName: 'r-4x5.jpg', width: 400, height: 500 },
    { key: 'ratio_5x7', label: '5:7', fileName: 'r-5x7.jpg', width: 500, height: 700 },
  ];
  const a = await jpeg(400, 500, '#c86');
  const b = await jpeg(500, 700, '#68c');

  {
    const v = new PackageValidator(specs);
    await v.check(specs[0], a);
    await v.check(specs[1], b);
    v.assertComplete();
    expect('Doğru oran + farklı içerik + tam adet geçer', true);
  }
  await rejects('5:7 adlı dosyada 4:5 piksel reddedilir', () => new PackageValidator(specs).check(specs[1], a));
  await rejects('Aynı SHA-256 içerikli iki dosya reddedilir', async () => {
    const same = await jpeg(500, 700, '#c86');
    const v = new PackageValidator([specs[1], { ...specs[1], key: 'dup', fileName: 'dup.jpg' }]);
    await v.check(specs[1], same);
    await v.check({ ...specs[1], key: 'dup', fileName: 'dup.jpg' }, same);
  });
  await rejects('Eksik dosya reddedilir', () => assertFileKeys({ ratio_4x5: 'x' }, specs));

  console.log(failed ? `\n${failed} kontrol BAŞARISIZ` : '\nTüm kontroller beklendiği gibi.');
  process.exit(failed ? 1 : 0);
}

void main();
