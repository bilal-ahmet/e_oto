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
