/**
 * 8 mockup sahnesi (CLAUDE.md §). Sanat görseli çerçeveli baskı olarak sahneye yerleştirilir.
 * FLUX.1 Kontext image-to-image prompt'ları; her biri "bu görseli çerçeveli duvar sanatı yap" kalıbında.
 * artwork bozulmadan korunur; yalnızca etrafına gerçekçi iç mekân kurulur.
 */

export type FluxAspect = '1:1' | '4:3' | '3:4' | '16:9';

export interface MockupScene {
  key: string;
  prompt: string;
  aspectRatio: FluxAspect;
}

const BASE =
  'Place this exact artwork as a framed art print hanging on the wall. Keep the artwork inside the frame unchanged and undistorted. Photorealistic interior photo, natural lighting, realistic shadows and perspective.';

export const MOCKUP_SCENES: MockupScene[] = [
  { key: 'minimal-living', aspectRatio: '4:3', prompt: `${BASE} Scene: a minimalist living room with a clean white wall, thin modern frame, bright airy daylight.` },
  { key: 'concrete-industrial', aspectRatio: '4:3', prompt: `${BASE} Scene: a modern industrial room with a dark grey concrete wall, slim black frame, moody contrast lighting.` },
  { key: 'sofa-lifestyle', aspectRatio: '4:3', prompt: `${BASE} Scene: above a cozy sofa in a styled living room, lifestyle composition with cushions and a side plant.` },
  { key: 'bedroom-headboard', aspectRatio: '4:3', prompt: `${BASE} Scene: above a bed headboard in a warm-toned bedroom, soft cozy lighting, neutral bedding.` },
  { key: 'home-office', aspectRatio: '4:3', prompt: `${BASE} Scene: behind a desk in a home office, with a laptop, mug and small shelf, soft daylight.` },
  { key: 'gallery-wall', aspectRatio: '1:1', prompt: `${BASE} Scene: as the centerpiece of a gallery wall composition with multiple coordinated frames on a neutral wall.` },
  { key: 'closeup-frame', aspectRatio: '1:1', prompt: `${BASE} Scene: a close-up detail shot showing the print texture, paper grain and the frame edge at an angle.` },
  { key: 'cafe-aesthetic', aspectRatio: '4:3', prompt: `${BASE} Scene: on the wall of a cozy aesthetic café / open space with warm wood tones and ambient light.` },
];

// ── Frame TV (16:9 yatay) ────────────────────────────────────────────────────
/**
 * TV ürün mockup'ları — TÜMÜ 16:9 (yatay ekran/çerçeve doğal dursun diye).
 * Kullanıcı kararı: 4 Frame TV oda sahnesi + 4 yatay çerçeveli baskı sahnesi = 8 (baskıyla aynı sayı, UI değişmez).
 */
const TV_BASE =
  'Place this exact artwork as the picture displayed on the screen of a wall-mounted Samsung Frame TV. Keep the artwork on the screen unchanged and undistorted, filling the whole screen. Photorealistic interior photo, the TV has a thin matte frame like a real Frame TV, subtle realistic screen glow and reflections, natural lighting and correct perspective.';

// Yatay çerçeveli baskı — print BASE ile aynı kalıp; 16:9 olduğundan geniş yatay çerçeve doğal durur.
const TV_FRAME_BASE = BASE;

export const TV_MOCKUP_SCENES: MockupScene[] = [
  // 4× Frame TV oda sahnesi
  { key: 'frametv-living', aspectRatio: '16:9', prompt: `${TV_BASE} Scene: mounted on a clean wall above a media console in a modern living room, bright airy daylight.` },
  { key: 'frametv-bedroom', aspectRatio: '16:9', prompt: `${TV_BASE} Scene: mounted above a low dresser in a warm-toned bedroom, soft cozy evening lighting.` },
  { key: 'frametv-console', aspectRatio: '16:9', prompt: `${TV_BASE} Scene: above a wooden TV console with plants and decor, styled Scandinavian living room.` },
  { key: 'frametv-minimal', aspectRatio: '16:9', prompt: `${TV_BASE} Scene: on a minimalist concrete-grey feature wall, slim black Frame TV bezel, moody ambient lighting.` },
  // 4× yatay çerçeveli baskı sahnesi
  { key: 'frame-living', aspectRatio: '16:9', prompt: `${TV_FRAME_BASE} Scene: a wide horizontal frame on a clean white living-room wall above a sofa, bright airy daylight.` },
  { key: 'frame-sofa', aspectRatio: '16:9', prompt: `${TV_FRAME_BASE} Scene: a large landscape-oriented frame above a cozy sofa with cushions and a side plant.` },
  { key: 'frame-office', aspectRatio: '16:9', prompt: `${TV_FRAME_BASE} Scene: a wide frame behind a desk in a home office with a laptop and shelf, soft daylight.` },
  { key: 'frame-gallery', aspectRatio: '16:9', prompt: `${TV_FRAME_BASE} Scene: a wide statement frame as the centerpiece on a neutral gallery-style wall, warm ambient light.` },
];
