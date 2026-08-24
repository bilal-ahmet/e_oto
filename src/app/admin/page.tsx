import Link from 'next/link';
import { Card, EmptyState, LinkButton, PageHeader, SectionHeading } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { ClearRunsButton } from '@/components/ClearRunsButton';
import { EtsyConnection } from '@/components/EtsyConnection';
import { PinterestConnection } from '@/components/PinterestConnection';
import {
  listCompetitorListings,
  listCompetitorShops,
  listPipelineRuns,
  pipelineRunStatusCounts,
} from '@/lib/db/queries';
import { STATUS_META } from '@/lib/status';

// Her istekte taze veri (DB'den).
export const dynamic = 'force-dynamic';

// Sayfa başına kayıt. Toplamda sınır YOK — sayfalama tüm geçmişi kapsar.
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

  // Tek sayım sorgusu: toplam, durum sayaçlarının toplamıdır — ayrıca COUNT(*) atmaya gerek yok.
  const counts = await pipelineRunStatusCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Sayfa numarası kullanıcıdan gelir → aralığa sıkıştır (elle yazılan `?p=999` boş liste vermesin).
  const page = Math.min(Math.max(Number(p) || 1, 1), pageCount);
  const offset = (page - 1) * PAGE_SIZE;

  const [runs, listings, shops] = await Promise.all([
    listPipelineRuns(PAGE_SIZE, offset),
    // Yalnızca ilk 5 gösteriliyor → sınırı SQL'e ver. Sorgu zaten opportunity_score DESC sıralı
    // döndüğü için burada tekrar sıralamaya da gerek yok.
    listCompetitorListings(undefined, 5),
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
  const topCompetitors = listings; // SQL zaten skora göre sıralı ve 5'le sınırlı

  const stats = [
    { label: 'Toplam çalıştırma', value: total },
    { label: 'Onay bekleyen', value: awaiting },
    { label: 'Yayınlanan', value: n('done') },
    { label: 'Hatalı', value: n('error') },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Genel bakış"
        title="Panel"
        description="Üretim hattı durumu ve rakip fırsatlarına genel bakış."
        action={<LinkButton href="/admin/generate">Yeni üretim</LinkButton>}
      />

      <EtsyConnection callbackResult={{ status: etsy, reason: etsy ? reason : undefined }} />
      <PinterestConnection callbackResult={{ status: pinterest, reason: pinterest ? reason : undefined }} />

      {/* Sayaçlar tek bir "defter şeridi": dört ayrı kart yerine bölünmüş tek levha —
          bunlar bağımsız kartlar değil, aynı tablonun sütunları. */}
      <Card padded={false}>
        <dl className="grid grid-cols-2 divide-sand md:grid-cols-4 md:divide-x">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={`px-5 py-4 ${i < 2 ? 'border-b border-sand md:border-b-0' : ''}`}
            >
              <dt className="font-mono text-label uppercase tracking-label text-ink-faint">
                {s.label}
              </dt>
              <dd className="mt-1 font-display text-4xl tabular-nums text-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <SectionHeading
            title="Son çalıştırmalar"
            description="Sadece bilgi amaçlı liste — işlem yapmak için üretim ekranını kullan."
          />

          <Card padded={false}>
            {runs.length === 0 ? (
              <EmptyState
                title="Henüz çalıştırma yok"
                description="İlk üretimi başlattığında buraya düşecek."
                action={<LinkButton href="/admin/generate" size="sm">Yeni üretim</LinkButton>}
              />
            ) : (
              <>
                <ul className="divide-y divide-sand-soft">
                  {runs.map((run) => {
                    const meta = STATUS_META[run.status];
                    // Hata durumunda jenerik açıklama yerine gerçek sebebi göster — asıl bilgi odur.
                    const note =
                      run.status === 'error' && run.errorMessage ? run.errorMessage : meta.description;
                    // Not rengi durum SINIFINDAN türetilir (elle üçleme değil) — sıra
                    // sendeyse altın, hata kırmızı, gerisi sakin.
                    const noteClass =
                      run.status === 'error'
                        ? 'text-state-error-ink'
                        : meta.kind === 'waiting'
                          ? 'text-state-turn-ink'
                          : 'text-ink-muted';
                    return (
                      <li key={run.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{run.prompt}</p>
                          <p className={`mt-1 text-xs ${noteClass}`}>{note}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <StatusBadge status={run.status} />
                          <p className="mt-1.5 font-mono text-label tabular-nums text-ink-faint">
                            {formatDate(run.updatedAt)} · {run.id.slice(0, 8)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-sand bg-shade px-5 py-3">
                  <span className="font-mono text-label uppercase tracking-label tabular-nums text-ink-faint">
                    {offset + 1}–{offset + runs.length} / {total} kayıt
                  </span>
                  <div className="flex items-center gap-1">
                    <PageLink href={`/admin?p=${page - 1}`} disabled={page <= 1}>
                      ← Önceki
                    </PageLink>
                    {pageNumbers(page, pageCount).map((n, i) =>
                      n === 'gap' ? (
                        <span key={`gap-${i}`} className="px-1 text-xs text-sand">
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
          <SectionHeading
            title="En iyi fırsatlar"
            action={
              <Link
                href="/admin/competitors"
                className="font-mono text-label uppercase tracking-label text-ink-muted hover:text-ink"
              >
                Tümü →
              </Link>
            }
          />
          <Card padded={false}>
            {topCompetitors.length === 0 ? (
              <EmptyState
                title="Henüz rakip taraması yok"
                description="Rakip Analizi ekranından bir mağaza tarat."
              />
            ) : (
              <ul className="divide-y divide-sand-soft">
                {topCompetitors.map((c) => (
                  <li key={c.listingId} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{c.title}</p>
                        <p className="mt-0.5 font-mono text-label uppercase tracking-label text-ink-faint">
                          {shopName(c.shopId)}
                        </p>
                      </div>
                      {/* Skor bir rozet değil, bir ölçüm: solundaki altın çizgi onu
                          vurgular, renkli bir hap gibi dikkat çalmaz. */}
                      <span className="shrink-0 border-l-2 border-gold pl-2 font-mono text-base tabular-nums text-ink">
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
 *
 * `scroll={false}` ŞART: App Router'da <Link> varsayılanı her gezinmede sayfanın tepesine
 * kaydırmaktır. Liste sayfanın ortasında olduğu için kullanıcı her sayfa değiştirdiğinde
 * yukarı fırlıyor ve listeyi tekrar bulmak için aşağı kaydırmak zorunda kalıyordu.
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
  const base = 'rounded-full px-2.5 py-1 font-mono text-label uppercase tracking-label tabular-nums';
  if (disabled) {
    return (
      <span className={`${base} ${current ? 'bg-ink text-paper' : 'text-sand'}`}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={false}
      className={`${base} text-ink-muted transition-colors hover:bg-sand-soft hover:text-ink`}
    >
      {children}
    </Link>
  );
}
