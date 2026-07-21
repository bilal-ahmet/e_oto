/**
 * Zoom (Ken Burns) tanıtım videosu — ffmpeg-static ile.
 * Bir görselden ~8 sn yavaş zoom mp4 (H.264, 1080×1350) üretir. Etsy video limiti 5-15 sn.
 * Sistemde ffmpeg gerektirmez; ffmpeg-static binary'si kullanılır.
 * Yalnızca server-side import edilir.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readFile, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import ffmpegStatic from 'ffmpeg-static';

/**
 * ffmpeg binary yolunu çözer. Bundler (Turbopack) ffmpeg-static'in __dirname'ini `\ROOT\` ile
 * bozabildiğinden, export edilen yol mevcut değilse cwd/node_modules'tan düşülür.
 */
function resolveFfmpeg(): string {
  if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  const bin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  return path.join(process.cwd(), 'node_modules', 'ffmpeg-static', bin);
}

const DURATION = 8; // sn
const FPS = 30;
const OUT_W = 1080;
const OUT_H = 1350; // 4:5

/** ffmpeg asılırsa süreci öldür — pipeline adımı sonsuza kadar beklemesin. */
const FFMPEG_TIMEOUT_MS = 5 * 60_000;

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = resolveFfmpeg();
    if (!existsSync(ffmpegPath)) return reject(new Error(`ffmpeg binary bulunamadı: ${ffmpegPath}`));
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, FFMPEG_TIMEOUT_MS);
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`ffmpeg ${FFMPEG_TIMEOUT_MS / 1000} sn içinde bitmedi — iptal edildi.`));
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg çıkış kodu ${code}: ${stderr.slice(-500)}`));
    });
  });
}

/**
 * Verilen görselden zoom video (mp4 buffer) üretir.
 * @param image Kaynak görsel buffer'ı (mockup veya master).
 */
export async function makeZoomVideo(image: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'etsy-vid-'));
  const inPath = path.join(dir, 'in.png');
  const outPath = path.join(dir, 'out.mp4');
  try {
    await writeFile(inPath, image);
    const frames = DURATION * FPS;
    // Önce büyük ölçeğe çek (zoompan kalitesi), sonra yavaş zoom + çıkış boyutu.
    // zoompan varsayılan olarak sol-üste (0,0) zoom yapar; x/y ile TAM ORTAYA sabitlenir.
    const vf =
      `scale=${OUT_W * 2}:${OUT_H * 2}:force_original_aspect_ratio=increase,` +
      `crop=${OUT_W * 2}:${OUT_H * 2},` +
      `zoompan=z='min(zoom+0.0012,1.25)':` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
      `d=${frames}:s=${OUT_W}x${OUT_H}:fps=${FPS},` +
      `format=yuv420p`;
    await runFfmpeg([
      '-y',
      '-loglevel', 'error',
      '-threads', '1', // 1 vCPU instance: fazla thread yalnızca context-switch maliyeti üretir
      '-loop', '1',
      '-i', inPath,
      '-t', String(DURATION),
      '-vf', vf,
      '-c:v', 'libx264',
      '-preset', 'veryfast', // 8 sn'lik 1080x1350 klip için 'medium' gereksiz; ~3-4× daha hızlı
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outPath,
    ]);
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
