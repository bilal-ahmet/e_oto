import Link from 'next/link';
import { Card, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { ClearRunsButton } from '@/components/ClearRunsButton';
import { EtsyConnection } from '@/components/EtsyConnection';
import { PinterestConnection } from '@/components/PinterestConnection';
import {
  countPipelineRuns,
  listCompetitorListings,
  listCompetitorShops,
  listPipelineRuns,
  pipelineRunStatusCounts,
} from '@/lib/db/queries';
import { STATUS_META } from '@/lib/status';

// Her istekte taze veri (DB'den).
export const dynamic = 'force-dynamic';

// Sayfa başına kayıt. Toplamda sınır YOK — sayfalama tüm geçmişi kapsar (bkz. countPipelineRuns).
const PAGE_SIZE = 10;

/**
 * Sayfalama çubuğunda gösterilecek numaralar. Sayfa sayısı çoğaldığında hepsini basmak yerine
 * ilk/son + geçerli sayfanın etrafındaki pencere gösterilir, aradaki boşluklar 'gap' olur:
 *   1 … 4 [5] 6 … 20
 */
function pageNumbers(current: number, count: number): (number | 'gap')[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const around = new Set([1, count, current, current - 1, current + 1]);
  // Baş/son sınırdayken pencere daralmasın — hep aynı sayıda slot görünsün.
  if (current <= 3) [2, 3, 4].forEach((n) => around.add(n));
  if (current >= count - 2) [count - 3, count - 2, count - 1].forEach((n) => around.add(n));

  const sorted = [...around].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push('gap');
    out.push(n);
    prev = n;
  }
  return out;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function DashboardPage({
  searchParams,
}: {
  // OAuth callback'leri buraya `?etsy=...` veya `?pinterest=...` (+ hata durumunda
  // `&reason=...`) ile döner. `reason` iki sağlayıcı arasında paylaşılır; hangisi hata
  // döndüyse yalnızca ona verilir. `p` = çalıştırma listesi sayfa numarası (1'den başlar).
  searchParams: Promise<{ etsy?: string; pinterest?: string; reason?: string; p?: string }>;
}) {
  const { etsy, pinterest, reason, p } = await searchParams;

  const total = await countPipelineRuns();
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Sayfa numarası kullanıcıdan gelir → aralığa sıkıştır (elle yazılan `?p=999` boş liste vermesin).
  const page = Math.min(Math.max(Number(p) || 1, 1), pageCount);
  const offset = (page - 1) * PAGE_SIZE;

  const [runs, counts, listings, shops] = await Promise.all([
    listPipelineRuns(PAGE_SIZE, offset),
    pipelineRunStatusCounts(),
    listCompetitorListings(),
    listCompetitorShops(),
  ]);

  // Sayaçlar TÜM kayıtlar üzerinden (ekrandaki sayfadan değil — yoksa sayfa değişince rakam değişirdi).
  const n = (s: string) => counts[s] ?? 0;
  const awaiting = n('awaiting_approval') + n('awaiting_seo_approval') + n('awaiting_publish');
  const working =
    n('queued') +
    n('generating_image') +
    n('generating_seo') +
    n('processing_files') +
    n('publishing_etsy') +
    n('publishing_pinterest');

  const shopName = (id: number) => shops.find((s) => s.shopId === id)?.shopName ?? `#${id}`;
  const topCompetitors = [...listings]
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 5);

  const stats = [
    { label: 'Toplam çalıştırma', value: total },
    { label: 'Onay bekleyen', value: awaiting },
    { label: 'Yayınlanan', value: n('done') },
    { label: 'Hatalı', value: n('error') },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Panel"
          description="Üretim hattı durumu ve rakip fırsatlarına genel bakış."
        />
        <Link
          href="/admin/drafts"
          className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
        >
          Taslaklar →
        </Link>
      </div>

      <EtsyConnection callbackResult={{ status: etsy, reason: etsy ? reason : undefined }} />
      <PinterestConnection callbackResult={{ status: pinterest, reason: pinterest ? reason : undefined }} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <div className="text-sm text-zinc-500">{s.label}</div>
            <div className="mt-1 text-3xl font-semibold text-zinc-900">{s.value}</div>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Son çalıştırmalar</h2>
              <p className="text-xs text-zinc-400">
                Sadece bilgi amaçlı liste — işlem yapmak için üretim ekranını kullan.
              </p>
            </div>
            <Link href="/admin/generate" className="text-sm font-medium text-rose-600 hover:text-rose-700">
              Yeni üretim →
            </Link>
          </div>

          <Card className="p-0">
            {runs.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-zinc-400">Henüz çalıştırma yok.</p>
            ) : (
              <>
                <ul className="divide-y divide-zinc-100">
                  {runs.map((run) => {
                    const meta = STATUS_META[run.status];
                    // Hata durumunda jenerik açıklama yerine gerçek sebebi göster — asıl bilgi odur.
                    const note =
                      run.status === 'error' && run.errorMessage ? run.errorMessage : meta.description;
                    const noteClass =
                      run.status === 'error'
                        ? 'text-red-600'
                        : meta.kind === 'waiting'
                          ? 'text-amber-700'
                          : 'text-zinc-500';
                    return (
                      <li key={run.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-900">{run.prompt}</p>
                          <p className={`mt-1 text-xs ${noteClass}`}>{note}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <StatusBadge status={run.status} />
                          <p className="mt-1 text-xs text-zinc-400">
                            {formatDate(run.updatedAt)} · {run.id.slice(0, 8)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-zinc-100 px-5 py-3">
                  <span className="text-xs text-zinc-400">
                    {offset + 1}–{offset + runs.length} / {total} kayıt
                  </span>
                  <div className="flex items-center gap-1">
                    <PageLink href={`/admin?p=${page - 1}`} disabled={page <= 1}>
                      ← Önceki
                    </PageLink>
                    {pageNumbers(page, pageCount).map((n, i) =>
                      n === 'gap' ? (
                        <span key={`gap-${i}`} className="px-1 text-xs text-zinc-300">
                          …
                        </span>
                      ) : (
                        <PageLink key={n} href={`/admin?p=${n}`} disabled={n === page} current={n === page}>
                          {n}
                        </PageLink>
                      ),
                    )}
                    <PageLink href={`/admin?p=${page + 1}`} disabled={page >= pageCount}>
                      Sonraki →
                    </PageLink>
                  </div>
                </div>
              </>
            )}
          </Card>

          <div className="mt-3 flex justify-end">
            <ClearRunsButton total={total} active={working + awaiting} />
          </div>
        </section>

        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">En iyi fırsatlar</h2>
            <Link
              href="/admin/competitors"
              className="text-sm font-medium text-rose-600 hover:text-rose-700"
            >
              Tümü →
            </Link>
          </div>
          <Card className="p-0">
            {topCompetitors.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-zinc-400">Henüz rakip taraması yok.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {topCompetitors.map((c) => (
                  <li key={c.listingId} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-900">{c.title}</p>
                        <p className="mt-0.5 text-xs text-zinc-400">{shopName(c.shopId)}</p>
                      </div>
                      <span className="shrink-0 rounded-md bg-green-50 px-2 py-0.5 text-sm font-semibold text-green-700">
                        {c.opportunityScore.toFixed(1)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

/**
 * Sayfalama düğmesi — sınırdaki ok ve bulunulan sayfa tıklanamaz (link yerine düz metin) olur.
 * `current` yalnızca görünümü değiştirir: bulunulan sayfa soluk değil, vurgulu gösterilir.
 */
function PageLink({
  href,
  disabled,
  current = false,
  children,
}: {
  href: string;
  disabled: boolean;
  current?: boolean;
  children: React.ReactNode;
}) {
  const base = 'rounded-md px-2.5 py-1 text-xs font-medium';
  if (disabled) {
    return (
      <span className={`${base} ${current ? 'bg-rose-600 text-white' : 'text-zinc-300'}`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={`${base} text-zinc-600 transition-colors hover:bg-zinc-100`}>
      {children}
    </Link>
  );
}
