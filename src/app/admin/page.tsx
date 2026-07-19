import Link from 'next/link';
import { Card, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/StatusBadge';
import { listCompetitorListings, listCompetitorShops, listPipelineRuns } from '@/lib/db/queries';

// Her istekte taze veri (DB'den).
export const dynamic = 'force-dynamic';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function DashboardPage() {
  const [runs, listings, shops] = await Promise.all([
    listPipelineRuns(50),
    listCompetitorListings(),
    listCompetitorShops(),
  ]);

  const awaiting = runs.filter((r) => r.status === 'awaiting_approval').length;
  const done = runs.filter((r) => r.status === 'done').length;
  const errored = runs.filter((r) => r.status === 'error').length;

  const shopName = (id: number) => shops.find((s) => s.shopId === id)?.shopName ?? `#${id}`;
  const topCompetitors = [...listings]
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 5);

  const stats = [
    { label: 'Toplam çalıştırma', value: runs.length },
    { label: 'Onay bekleyen', value: awaiting },
    { label: 'Tamamlanan', value: done },
    { label: 'Hatalı', value: errored },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Panel"
          description="Üretim hattı durumu ve rakip fırsatlarına genel bakış."
        />
        <Link
          href="/drafts"
          className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
        >
          Taslaklar →
        </Link>
      </div>

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
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Son çalıştırmalar</h2>
            <Link href="/generate" className="text-sm font-medium text-rose-600 hover:text-rose-700">
              Yeni üretim →
            </Link>
          </div>
          <Card className="p-0">
            {runs.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-zinc-400">Henüz çalıştırma yok.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {runs.map((run) => (
                  <li key={run.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900">{run.prompt}</p>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {run.id.slice(0, 8)} · {formatDate(run.updatedAt)}
                      </p>
                    </div>
                    <StatusBadge status={run.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">En iyi fırsatlar</h2>
            <Link
              href="/competitors"
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
