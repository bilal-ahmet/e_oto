'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { ProductType, SeoData } from '@/types';
import { Button, Card, FRAMED_IMG, Field, Framed, Input, SectionHeading, Spinner, Textarea } from '@/components/ui';
import { previewAspectClass } from './shared';

export function SeoEditor({
  initial,
  image,
  productType,
  busy,
  onApprove,
  onReject,
}: {
  initial: SeoData;
  image: string | null;
  /** Secilen eserin en-boy orani urun tipine gore degisir (print 3:4 / tv 16:9). */
  productType?: ProductType;
  busy: boolean;
  onApprove: (seo: SeoData) => void;
  onReject: () => void;
}) {
  const [seo, setSeo] = useState<SeoData>(initial);
  function setField<K extends keyof SeoData>(key: K, value: SeoData[K]) {
    setSeo((s) => ({ ...s, [key]: value }));
  }
  function setArrayItem(key: 'tags' | 'materials', index: number, value: string) {
    setSeo((s) => {
      const next = [...s[key]];
      next[index] = value;
      return { ...s, [key]: next };
    });
  }
  const titleLen = seo.title.length;
  const emptyTags = seo.tags.filter((t) => !t.trim()).length;
  // Yinelenen etiketler yalnizca ISARETLENIR, engellenmez: onay akisina yeni bir kural
  // koymak davranis degisikligi olurdu.
  const duplicateTags = new Set(
    seo.tags
      .map((t) => t.trim().toLowerCase())
      .filter((t, i, arr) => t !== '' && arr.indexOf(t) !== i),
  );

  return (
    <Card>
      <SectionHeading
        no="02"
        title="Metinleri incele"
        description="Onaylamadan önce istediğin alanı değiştirebilirsin. Onaylayınca dosyalar ve mockuplar üretilir."
      />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Seçilen eser 56px'lik bir küçük resim değil, gerçek boyutta ve yapışkan:
            metinleri yazarken hangi görsel için yazdığın gözünün önünde kalıyor. */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          {image ? (
            <Framed ratio={previewAspectClass(productType)} caption="Seçilen eser">
              <Image
                src={image}
                alt="Seçilen görsel"
                width={280}
                height={373}
                unoptimized
                className={FRAMED_IMG}
              />
            </Framed>
          ) : null}
        </div>

        {/*
          34 alan tek yığın hâlinde hiyerarşisizdi. Artık öneme göre üç levha:
          en çok etkisi olan ikisi açık, neredeyse hiç değişmeyen materyaller kapalı.
          <details> kullanılıyor — state gerekmez, klavye desteği bedava.
        */}
        <div className="space-y-3">
          <details open className="rounded-xs border border-sand bg-sheet">
            <summary className="cursor-pointer px-4 py-3 font-mono text-label uppercase tracking-label text-ink">
              Başlık &amp; açıklama
            </summary>
            <div className="space-y-5 border-t border-sand px-4 py-4">
              <Field label="Başlık" htmlFor="seo-title" counter={{ value: titleLen, max: 140 }}>
                <Textarea
                  id="seo-title"
                  value={seo.title}
                  onChange={(e) => setField('title', e.target.value)}
                  rows={2}
                  invalid={titleLen > 140}
                />
              </Field>
              <Field label="Açıklama" htmlFor="seo-desc">
                <Textarea
                  id="seo-desc"
                  value={seo.description}
                  onChange={(e) => setField('description', e.target.value)}
                  rows={8}
                />
              </Field>
            </div>
          </details>

          <details open className="rounded-xs border border-sand bg-sheet">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 font-mono text-label uppercase tracking-label text-ink">
              <span>Etiketler</span>
              <span className="tabular-nums text-ink-faint">
                {seo.tags.length}/13 · {emptyTags} boş
              </span>
            </summary>
            <div className="border-t border-sand px-4 py-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {seo.tags.map((tag, i) => {
                  const dup = tag.trim() !== '' && duplicateTags.has(tag.trim().toLowerCase());
                  return (
                    <div key={i}>
                      <Input
                        value={tag}
                        maxLength={20}
                        aria-label={`Etiket ${i + 1}`}
                        onChange={(e) => setArrayItem('tags', i, e.target.value)}
                        className={`px-2.5 py-1.5 ${dup ? 'border-gold' : ''}`}
                      />
                      {/* maxLength vardı ama sayaç YOKTU — kullanıcı sınıra ne kadar
                          yaklaştığını göremiyordu. */}
                      <span
                        className={`mt-1 block text-right font-mono text-label tabular-nums ${
                          tag.length >= 20
                            ? 'text-state-error-ink'
                            : tag.length >= 18
                              ? 'text-gold-deep'
                              : 'text-ink-faint'
                        }`}
                      >
                        {tag.length}/20
                      </span>
                    </div>
                  );
                })}
              </div>
              {duplicateTags.size > 0 ? (
                <p className="mt-3 font-mono text-label uppercase tracking-label text-gold-deep">
                  Altın çerçeveli etiketler yinelenmiş — Etsy tekrarları saymaz.
                </p>
              ) : null}
            </div>
          </details>

          <details className="rounded-xs border border-sand bg-sheet">
            <summary className="cursor-pointer px-4 py-3 font-mono text-label uppercase tracking-label text-ink">
              Materyaller &amp; öznitelikler
            </summary>
            <div className="space-y-5 border-t border-sand px-4 py-4">
              <div>
                <p className="text-sm font-medium text-ink">Materyaller ({seo.materials.length})</p>
                <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {seo.materials.map((m, i) => (
                    <Input
                      key={i}
                      value={m}
                      aria-label={`Materyal ${i + 1}`}
                      onChange={(e) => setArrayItem('materials', i, e.target.value)}
                      className="px-2.5 py-1.5"
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-ink">
                  Öznitelikler{' '}
                  <span className="font-normal text-ink-faint">
                    (kategori Digital Prints olarak otomatik yazılır)
                  </span>
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                  {(['orientation', 'style', 'occasion', 'room', 'subject'] as const).map((k) => (
                    <div key={k}>
                      <span className="font-mono text-label uppercase tracking-label text-ink-muted">
                        {k}
                      </span>
                      <Input
                        value={seo.attributes[k]}
                        aria-label={k}
                        onChange={(e) =>
                          setSeo((s) => ({ ...s, attributes: { ...s.attributes, [k]: e.target.value } }))
                        }
                        className="mt-1 px-2.5 py-1.5"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>

      {/* Eylemler yapışkan: 34 alanı kaydırırken onay butonu hep erişilebilir. */}
      <div className="sticky bottom-0 -mx-5 -mb-5 mt-6 flex flex-wrap gap-3 border-t border-sand bg-shade px-5 py-4">
        <Button onClick={() => onApprove(seo)} disabled={busy}>
          {busy ? <Spinner /> : null}
          Onayla — medya &amp; dosyaları üret
        </Button>
        <Button variant="ghost" onClick={onReject} disabled={busy}>
          Bu üretimi bırak
        </Button>
      </div>
    </Card>
  );
}
