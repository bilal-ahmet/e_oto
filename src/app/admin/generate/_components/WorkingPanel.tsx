'use client';

import { useEffect, useRef, useState } from 'react';
import type { PipelineStatus } from '@/types';
import { Card, Spinner } from '@/components/ui';
import { STATUS_META } from '@/lib/status';
import { stageIndexFor } from './shared';

/**
 * Adımların kabaca ne kadar sürdüğü. Hattan OKUNMAZ — yalnızca kullanıcıya beklentiyi
 * veren statik metin. Yanlış olması bir şeyi bozmaz, olmaması ise kullanıcıyı
 * "takıldı mı?" diye düşündürüyordu.
 */
const TYPICAL: Partial<Record<PipelineStatus, string>> = {
  generating_image: 'genelde 1–3 dk sürer',
  generating_seo: 'genelde 30 sn – 1 dk sürer',
  processing_files: 'genelde 3–8 dk sürer',
  publishing_etsy: 'genelde 1–3 dk sürer',
  publishing_pinterest: 'genelde 10–30 sn sürer',
};

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Sistem çalışırken gösterilen ekran.
 *
 * Eskiden burada tek satırlık bir spinner vardı: "Dosyalar hazırlanıyor…" ve başka
 * hiçbir şey. En uzun adım 8 dakika sürebildiği için kullanıcı takılıp takılmadığını
 * anlayamıyordu. Artık hangi kapıda olunduğu, ne yapıldığı, ne kadar zaman geçtiği ve
 * ne kadar sürmesinin normal olduğu görünüyor.
 *
 * Sayaç SALT GÖRSELDİR: ağ isteği eklemez, polling'e dokunmaz.
 */
export function WorkingPanel({ status }: { status: PipelineStatus }) {
  const meta = STATUS_META[status];
  const gate = stageIndexFor(status);
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    // `Date.now()` YALNIZCA effect/interval içinde okunur — React derleyicisi render
    // gövdesinde saf olmayan çağrıya izin vermez.
    //
    // Sayaç burada SIFIRLANMAZ (`setSeconds(0)` yok): effect gövdesinde senkron setState
    // cascade render'a yol açıyor (react-hooks/set-state-in-effect). Bunun yerine çağıran
    // bileşene `key={status}` verir; adım değişince bileşen yeniden monte olur ve sayaç
    // doğal olarak 0'dan başlar.
    startedAt.current = Date.now();
    const id = setInterval(() => {
      if (startedAt.current !== null) {
        setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card>
      <p className="font-mono text-label uppercase tracking-label text-gold-deep">
        No. 0{Math.min(gate + 1, 4)} — {meta.label}
      </p>
      <h2 className="mt-2 flex items-center gap-3 font-display text-2xl tracking-tight text-ink">
        <Spinner className="text-gold-deep" />
        {meta.label}
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-body">{meta.description}</p>

      {/* Belirsiz ilerleme — yüzde uydurmaz, yalnızca "çalışıyor" der.
          motion-safe: hareketi azaltılmış modda çizgi sabit kalır, kaybolmaz. */}
      <div className="mt-5 h-px w-full overflow-hidden bg-sand">
        <div className="h-full w-1/3 bg-gold motion-safe:animate-[working-sweep_2.4s_ease-in-out_infinite]" />
      </div>

      <p className="mt-3 font-mono text-label uppercase tracking-label tabular-nums text-ink-faint">
        {mmss(seconds)} geçti
        {TYPICAL[status] ? ` · ${TYPICAL[status]}` : ''}
      </p>
      <p className="mt-1 text-sm text-ink-muted">Sayfayı kapatsan bile iş arka planda devam eder.</p>
    </Card>
  );
}
