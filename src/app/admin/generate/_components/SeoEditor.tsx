'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { SeoData } from '@/types';
import { Button, Card, Spinner } from '@/components/ui';

export function SeoEditor({
  initial,
  image,
  busy,
  onApprove,
  onReject,
}: {
  initial: SeoData;
  image: string | null;
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

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">SEO incele & düzenle</h2>
          <p className="text-sm text-zinc-500">Onaylamadan önce istediğin alanı değiştirebilirsin.</p>
        </div>
        {image ? (
          <Image
            src={image}
            alt="Seçilen görsel"
            width={56}
            height={56}
            unoptimized
            className="size-14 rounded-lg object-cover ring-1 ring-zinc-200"
          />
        ) : null}
      </div>

      <div className="mt-4 space-y-5">
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700">Başlık</label>
            <span className={`text-xs ${titleLen > 140 ? 'text-red-600' : 'text-zinc-400'}`}>{titleLen}/140</span>
          </div>
          <textarea
            value={seo.title}
            onChange={(e) => setField('title', e.target.value)}
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">Etiketler ({seo.tags.length})</label>
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {seo.tags.map((tag, i) => (
              <input
                key={i}
                value={tag}
                maxLength={20}
                onChange={(e) => setArrayItem('tags', i, e.target.value)}
                className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">Açıklama</label>
          <textarea
            value={seo.description}
            onChange={(e) => setField('description', e.target.value)}
            rows={5}
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">Materyaller ({seo.materials.length})</label>
          <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {seo.materials.map((m, i) => (
              <input
                key={i}
                value={m}
                onChange={(e) => setArrayItem('materials', i, e.target.value)}
                className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-zinc-700">
            Öznitelikler <span className="text-zinc-400">(Etsy: kategori Digital Prints otomatik)</span>
          </label>
          <div className="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(['orientation', 'style', 'occasion', 'room', 'subject'] as const).map((k) => (
              <div key={k}>
                <span className="text-xs capitalize text-zinc-500">{k}</span>
                <input
                  value={seo.attributes[k]}
                  onChange={(e) =>
                    setSeo((s) => ({ ...s, attributes: { ...s.attributes, [k]: e.target.value } }))
                  }
                  className="mt-1 w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <Button onClick={() => onApprove(seo)} disabled={busy}>
          {busy ? <Spinner /> : null}
          Onayla — medya & dosyaları üret
        </Button>
        <Button variant="ghost" onClick={onReject} disabled={busy}>
          İptal
        </Button>
      </div>
    </Card>
  );
}
