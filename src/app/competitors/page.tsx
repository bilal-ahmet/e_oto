'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CompetitorListing, CompetitorShop } from '@/types';
import { Button, Card, PageHeader, Spinner } from '@/components/ui';

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

  useEffect(() => {
    void load();
  }, [load]);

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
        <Card className="mb-4 border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          placeholder="Mağaza adı veya shop ID"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        />
        <Button variant="secondary" onClick={runScan} disabled={scanning || !scanInput.trim()}>
          {scanning ? <Spinner /> : null}
          {scanning ? 'Taranıyor…' : 'Taramayı çalıştır'}
        </Button>

        <select
          value={shopFilter}
          onChange={(e) => setShopFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        >
          <option value="all">Tüm mağazalar</option>
          {shops.map((s) => (
            <option key={s.shopId} value={s.shopId}>
              {s.shopName}
            </option>
          ))}
        </select>
        <span className="text-sm text-zinc-500">{rows.length} ürün</span>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-5 py-3 font-medium">Ürün</th>
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-4 py-3 font-medium">
                  <button
                    onClick={() => toggleSort(col.key)}
                    className="inline-flex items-center gap-1 hover:text-zinc-900"
                  >
                    {col.label}
                    <span className="text-zinc-400">
                      {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-5 py-8 text-center text-zinc-400">
                  <Spinner className="text-rose-600" /> Yükleniyor…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-5 py-8 text-center text-zinc-400">
                  Henüz tarama yok. Yukarıdan bir mağaza adı/ID girip taramayı çalıştır.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.listingId} className="hover:bg-zinc-50">
                  <td className="max-w-xs px-5 py-3">
                    <p className="truncate font-medium text-zinc-900">{row.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-400">{shopName(row.shopId)}</p>
                  </td>
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 tabular-nums ${
                        col.key === 'opportunityScore'
                          ? 'font-semibold text-green-700'
                          : 'text-zinc-700'
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
