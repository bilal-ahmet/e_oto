'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CompetitorListing, CompetitorShop } from '@/types';
import { Alert, Button, Card, EmptyState, Input, PageHeader, Select, Spinner } from '@/components/ui';

type SortKey = keyof Pick<
  CompetitorListing,
  'price' | 'numFavorers' | 'reviewCount' | 'estimatedSales' | 'monthlyVelocity' | 'opportunityScore'
>;

const COLUMNS: { key: SortKey; label: string; format: (v: number) => string }[] = [
  { key: 'price', label: 'Fiyat', format: (v) => `$${v.toFixed(2)}` },
  { key: 'numFavorers', label: 'Favori', format: (v) => v.toLocaleString('tr-TR') },
  { key: 'reviewCount', label: 'Yorum', format: (v) => v.toLocaleString('tr-TR') },
  { key: 'estimatedSales', label: 'Tah. satış', format: (v) => Math.round(v).toLocaleString('tr-TR') },
  { key: 'monthlyVelocity', label: 'Aylık hız', format: (v) => v.toFixed(1) },
  { key: 'opportunityScore', label: 'Fırsat skoru', format: (v) => v.toFixed(1) },
];

export default function CompetitorsPage() {
  const [shops, setShops] = useState<CompetitorShop[]>([]);
  const [listings, setListings] = useState<CompetitorListing[]>([]);
  const [shopFilter, setShopFilter] = useState<number | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('opportunityScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scanInput, setScanInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/competitors');
      if (res.ok) {
        const data: { shops: CompetitorShop[]; listings: CompetitorListing[] } = await res.json();
        setShops(data.shops);
        setListings(data.listings);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // İlk yükleme. `load()`u ÇAĞIRMAZ: o, ilk satırında setLoading(true) yapıyor ve effect
  // gövdesinde senkron setState cascade render'a yol açıyor (react-hooks/set-state-in-effect).
  // Burada `loading` zaten true başlıyor; tüm setState'ler await'ten SONRA çalışır.
  // `active` bayrağı: istek dönmeden bileşen sökülürse state yazılmaz.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/competitors');
        if (!res.ok || !active) return;
        const data: { shops: CompetitorShop[]; listings: CompetitorListing[] } = await res.json();
        if (!active) return;
        setShops(data.shops);
        setListings(data.listings);
      } catch {
        /* sessiz geç — hata durumunda liste boş kalır */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const shopName = useCallback(
    (id: number) => shops.find((s) => s.shopId === id)?.shopName ?? `#${id}`,
    [shops],
  );

  const rows = useMemo(() => {
    const filtered =
      shopFilter === 'all' ? listings : listings.filter((l) => l.shopId === shopFilter);
    return [...filtered].sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [listings, shopFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  async function runScan() {
    const value = scanInput.trim();
    if (!value) return;
    setScanning(true);
    setError(null);
    try {
      const isId = /^\d+$/.test(value);
      const res = await fetch('/api/competitors/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isId ? { shopId: Number(value) } : { shopName: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Tarama başarısız.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tarama başarısız.');
    } finally {
      setScanning(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Rakip Analizi"
        description="Tahmini satış ve fırsat skoruna göre rakip ürünler. Skorlar tahminidir, kesin satış değildir."
      />

      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          placeholder="Mağaza adı veya shop ID"
          className="w-64"
        />
        <Button variant="secondary" onClick={runScan} disabled={scanning || !scanInput.trim()}>
          {scanning ? <Spinner /> : null}
          {scanning ? 'Taranıyor…' : 'Taramayı çalıştır'}
        </Button>

        <Select
          value={shopFilter}
          onChange={(e) => setShopFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="w-64"
        >
          <option value="all">Tüm mağazalar</option>
          {shops.map((s) => (
            <option key={s.shopId} value={s.shopId}>
              {s.shopName}
            </option>
          ))}
        </Select>
        <span className="font-mono text-label uppercase tracking-label tabular-nums text-ink-faint">
          {rows.length} ürün
        </span>
      </div>

      <Card padded={false} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sand bg-shade text-left font-mono text-label uppercase tracking-label text-ink-muted">
              <th className="px-5 py-3 font-medium">Ürün</th>
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-4 py-3 font-medium">
                  <button
                    onClick={() => toggleSort(col.key)}
                    className="inline-flex items-center gap-1 transition-colors hover:text-ink"
                  >
                    {col.label}
                    {/* Aktif sıralama kolonu altın, pasifler kum — hangisine göre
                        sıralandığı okun rengiyle de okunuyor, sadece şekliyle değil. */}
                    <span className={sortKey === col.key ? 'text-gold-deep' : 'text-sand'}>
                      {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-soft">
            {loading ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-5 py-8 text-center text-ink-faint">
                  <Spinner className="text-gold-deep" /> Yükleniyor…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="p-0">
                  <EmptyState
                    title="Henüz tarama yok"
                    description="Yukarıdan bir mağaza adı veya shop ID girip taramayı çalıştır."
                  />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.listingId} className="transition-colors hover:bg-shade/60">
                  <td className="max-w-xs px-5 py-3">
                    <p className="truncate font-medium text-ink">{row.title}</p>
                    <p className="mt-0.5 font-mono text-label uppercase tracking-label text-ink-faint">
                      {shopName(row.shopId)}
                    </p>
                  </td>
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 tabular-nums ${
                        col.key === 'opportunityScore'
                          ? 'border-l-2 border-gold font-semibold text-ink'
                          : 'text-ink-body'
                      }`}
                    >
                      {col.format(row[col.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
