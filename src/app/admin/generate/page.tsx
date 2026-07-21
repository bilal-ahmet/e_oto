'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import type { ImageDraft, ImageModel, PinCopy, PipelineRun, PipelineStatus, SeoData } from '@/types';
import { Button, Card, PageHeader, Spinner } from '@/components/ui';
import { STATUS_META } from '@/lib/status';

const STAGES = [
  { key: 'image', label: 'Görsel' },
  { key: 'seo', label: 'SEO' },
  { key: 'files', label: 'Dosyalar' },
  { key: 'publish', label: 'Yayın' },
] as const;

// /api/competitor-research/analyze yanıtı
interface CompetitorAnalysis {
  id: number;
  source: {
    listingId: number;
    title: string;
    tags: string[];
    taxonomyId: number;
    numFavorers: number;
    views: number;
  };
  generated: { title: string; tags: string[]; description: string };
}

function stageIndexFor(status: PipelineStatus | 'idle'): number {
  switch (status) {
    case 'idle':
    case 'queued':
    case 'generating_image':
    case 'awaiting_approval':
      return 0;
    case 'generating_seo':
    case 'awaiting_seo_approval':
      return 1;
    case 'processing_files':
    case 'awaiting_publish':
      return 2;
    case 'publishing_etsy':
    case 'publishing_pinterest':
      return 3;
    case 'done':
      return 4;
    case 'error':
      return -1;
  }
}

function Stepper({ status }: { status: PipelineStatus }) {
  const current = stageIndexFor(status);
  return (
    <ol className="flex items-center gap-2">
      {STAGES.map((stage, i) => {
        const done = current > i;
        const active = current === i;
        return (
          <li key={stage.key} className="flex flex-1 items-center gap-2">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                done ? 'bg-green-600 text-white' : active ? 'bg-rose-600 text-white' : 'bg-zinc-200 text-zinc-500'
              }`}
            >
              {done ? '✓' : i + 1}
            </span>
            <span className={`text-sm font-medium ${active ? 'text-zinc-900' : 'text-zinc-400'}`}>
              {stage.label}
            </span>
            {i < STAGES.length - 1 ? (
              <span className={`h-px flex-1 ${done ? 'bg-green-300' : 'bg-zinc-200'}`} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// Sistem çalışıyor (polling sürer); insan-onayı durakları bu listede DEĞİL.
const WORKING: PipelineStatus[] = [
  'queued',
  'generating_image',
  'generating_seo',
  'processing_files',
  'publishing_etsy',
  'publishing_pinterest',
];

async function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  const buf = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return { base64: btoa(binary), mediaType: file.type || 'image/png' };
}

/**
 * Yanıtı JSON olarak okur; gövde boş/JSON değilse HTTP durumunu içeren anlaşılır bir hata atar.
 * (Next.js production'da yakalanmamış route hatası GÖVDESİZ 500 döner — düz `res.json()`
 * bunu "Unexpected end of JSON input" diye maskeleyip asıl sebebi gizler.)
 */
async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) throw new Error(`Sunucu boş yanıt döndü (HTTP ${res.status}). Sunucu loglarına bakın.`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Sunucu JSON olmayan yanıt döndü (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

export default function GeneratePage() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<ImageModel>('flux');
  const [variations, setVariations] = useState(3);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [note, setNote] = useState(''); // Instruction Üretici: opsiyonel ek not
  const [instructing, setInstructing] = useState(false); // talimat üretiliyor
  const [research, setResearch] = useState<CompetitorAnalysis | null>(null); // bağlı rakip analizi
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollWarning, setPollWarning] = useState<string | null>(null); // durum sorgusu yanıt vermiyor
  const [etsyConnected, setEtsyConnected] = useState<boolean | null>(null); // null = henüz bilinmiyor
  const [regenIndex, setRegenIndex] = useState<number | null>(null); // yeniden üretilen mockup
  const [drafts, setDrafts] = useState<ImageDraft[]>([]); // kaydedilmiş görsel taslakları
  const [draftBusy, setDraftBusy] = useState(false); // taslak işlemi (devam/sil/yükle) sürüyor
  const [savedVariations, setSavedVariations] = useState<Set<number>>(new Set()); // kaydedilen varyasyon index'leri

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  /**
   * Durum polling'i — üstel backoff'lu.
   * Sunucu yanıt vermediğinde (504/524) eski hal sabit 2 sn'de bir yeniden deniyordu; sunucu
   * zaten zorlanırken üstüne istek yığıyor ve kullanıcıya hiçbir şey söylemiyordu. Artık aralık
   * 2 → 30 sn'ye kadar açılır ve birkaç başarısızlıktan sonra durum ekranda görünür.
   */
  const POLL_OK_MS = 2000;
  const POLL_MAX_MS = 30_000;
  const WARN_AFTER_FAILURES = 3;

  const poll = useCallback(
    (id: string) => {
      stopPolling();
      let failures = 0;
      const tick = async () => {
        try {
          const res = await fetch(`/api/pipeline/status/${id}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data: PipelineRun = await res.json();
          failures = 0;
          setPollWarning(null);
          setRun(data);
          if (data.status === 'error') setError(data.errorMessage ?? 'Hata oluştu.');
          if (WORKING.includes(data.status)) {
            pollTimer.current = setTimeout(tick, POLL_OK_MS);
          }
        } catch {
          failures++;
          // 2s, 4s, 8s, 16s, 30s (tavan) — sunucuyu daha da boğmadan yeniden dene.
          const delay = Math.min(POLL_OK_MS * 2 ** (failures - 1), POLL_MAX_MS);
          if (failures >= WARN_AFTER_FAILURES) {
            setPollWarning(
              `Sunucu ${failures} denemedir durum bilgisi döndürmüyor. İşlem arka planda sürüyor olabilir; ` +
                `${Math.round(delay / 1000)} sn sonra tekrar denenecek. Sayfayı kapatsanız bile iş devam eder.`,
            );
          }
          pollTimer.current = setTimeout(tick, delay);
        }
      };
      pollTimer.current = setTimeout(tick, 1500);
    },
    [stopPolling],
  );

  // ── Taslaklar (kaydedilmiş görseller) ──────────────────────────────────────
  const loadDrafts = useCallback(async () => {
    try {
      const res = await fetch('/api/drafts');
      if (!res.ok) return;
      const data: { drafts?: ImageDraft[] } = await res.json();
      setDrafts(data.drafts ?? []);
    } catch {
      /* sessiz geç — galeri boş kalır */
    }
  }, []);
  // İlk yüklemede taslakları çek (setState await sonrası — senkron cascade yok).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/drafts');
        if (!res.ok || !active) return;
        const data: { drafts?: ImageDraft[] } = await res.json();
        if (active) setDrafts(data.drafts ?? []);
      } catch {
        /* sessiz geç */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Etsy bağlantısını ÜRETİMDEN ÖNCE kontrol et — token yoksa kullanıcı bunu eskiden ancak
  // hattın sonunda (mockup + video + 5 JPG üretildikten sonra) "Etsy bağlantısı yok" hatasıyla
  // öğreniyordu. Uyarı ekranın üstünde durur; üretimi engellemez (taslak biriktirmek serbest).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/etsy/status');
        if (!res.ok || !active) return;
        const data: { connected?: boolean } = await res.json();
        if (active) setEtsyConnected(Boolean(data.connected));
      } catch {
        /* sessiz geç — uyarı gösterilmez */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // /admin/drafts → "Bu taslakla devam et" buraya ?draft=<id> ile yönlendirir; otomatik başlat.
  useEffect(() => {
    const draftId = new URLSearchParams(window.location.search).get('draft');
    if (!draftId) return;
    window.history.replaceState(null, '', '/admin/generate'); // URL'i temizle
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/pipeline/from-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftId }),
        });
        const data = await readJson<PipelineRun & { error?: string }>(res);
        if (!active) return;
        if (!res.ok && res.status !== 202) {
          setError(data.error ?? 'Taslaktan başlatılamadı.');
          return;
        }
        setRun(data);
        poll(data.id);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Taslaktan başlatılamadı.');
      }
    })();
    return () => {
      active = false;
    };
  }, [poll]);

  // Bir varyasyonu taslaklara kaydet (seçim yapmadan, kaybetmeden).
  async function saveVariation(index: number, url: string) {
    setError(null);
    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variationUrl: url, prompt: run?.prompt }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Taslak kaydedilemedi.');
      }
      setSavedVariations((s) => new Set(s).add(index));
      loadDrafts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Taslak kaydedilemedi.');
    }
  }

  // Dışarıdan görsel yükleyip taslaklara ekle.
  async function uploadDraft(file: File) {
    setDraftBusy(true);
    setError(null);
    try {
      const upload = await fileToBase64(file);
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Görsel yüklenemedi.');
      }
      loadDrafts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Görsel yüklenemedi.');
    } finally {
      setDraftBusy(false);
    }
  }

  // Taslaktan devam et — yeni run başlatır, SEO'dan (kapı 2) itibaren akar.
  async function continueFromDraft(draftId: string) {
    setDraftBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pipeline/from-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, competitorResearchId: research?.id }),
      });
      const data = await readJson<PipelineRun & { error?: string }>(res);
      if (!res.ok && res.status !== 202) throw new Error(data.error ?? 'Taslaktan başlatılamadı.');
      setRun(data);
      poll(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Taslaktan başlatılamadı.');
    } finally {
      setDraftBusy(false);
    }
  }

  async function deleteDraft(id: string) {
    setDraftBusy(true);
    try {
      await fetch(`/api/drafts/${id}`, { method: 'DELETE' });
      loadDrafts();
    } finally {
      setDraftBusy(false);
    }
  }

  function reset() {
    stopPolling();
    setRun(null);
    setBusy(false);
    setError(null);
    setPollWarning(null);
    setPrompt('');
    setReferenceFile(null);
    setReferencePreview(null);
    setNote('');
    setResearch(null);
    setSavedVariations(new Set());
  }

  // Reddet/baştan başla — SADECE aktif run'ı temizler, girdileri (prompt, model, varyasyon,
  // referans, not, rakip analizi) KORUR. Böylece rakip linkini tekrar girip token harcamazsın.
  // Hata almış bir run'ı kaldığı onay kapısına döndürür (yeni üretim maliyeti yok).
  // Elde bir çıktı varsa anlamlıdır; yoksa buton gösterilmez.
  const canResume = Boolean(
    run &&
      run.status === 'error' &&
      (run.seo || run.variationUrls?.length),
  );

  async function resumeRun() {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pipeline/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: run.id }),
      });
      const data = await readJson<{ status?: string; error?: string }>(res);
      if (!res.ok) throw new Error(data.error ?? 'Run sürdürülemedi.');
      // Yeni durumu (ve varsa güncel alanları) tek sorguda çek.
      const fresh = await fetch(`/api/pipeline/status/${run.id}`);
      if (fresh.ok) setRun(await fresh.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run sürdürülemedi.');
    } finally {
      setBusy(false);
    }
  }

  function resetRun() {
    stopPolling();
    setRun(null);
    setBusy(false);
    setError(null);
    setPollWarning(null);
    setSavedVariations(new Set());
  }

  function onReferenceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setReferenceFile(file);
    if (!file) {
      setReferencePreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setReferencePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  // Instruction Üretici — referans görsel + opsiyonel nottan İngilizce transformation instruction
  // üretip Prompt kutusuna yazar. Kullanıcı düzenleyip "varyasyon üret" ile onaylar.
  async function generateInstruction() {
    if (!referenceFile) return;
    setInstructing(true);
    setError(null);
    try {
      const referenceImage = await fileToBase64(referenceFile);
      const res = await fetch('/api/instruction/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceImage, note: note.trim() || undefined }),
      });
      const data = await readJson<{ instruction?: string; error?: string }>(res);
      if (!res.ok || !data.instruction) throw new Error(data.error ?? 'Talimat üretilemedi.');
      setPrompt(data.instruction);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Talimat üretilemedi.');
    } finally {
      setInstructing(false);
    }
  }

  async function generate() {
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const referenceImage = referenceFile ? await fileToBase64(referenceFile) : undefined;
      const res = await fetch('/api/pipeline/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model,
          variations,
          referenceImage,
          competitorResearchId: research?.id,
        }),
      });
      const data = await readJson<PipelineRun & { error?: string }>(res);
      if (!res.ok && res.status !== 202) throw new Error(data.error ?? 'Üretim başarısız.');
      setRun(data);
      poll(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Üretim başarısız.');
    } finally {
      setBusy(false);
    }
  }

  // Adım onayları — hepsi arka planı tetikler, sonra polling başlatır.
  async function postStep(path: string, payload: Record<string, unknown>) {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: run.id, ...payload }),
      });
      if (!res.ok && res.status !== 202) {
        const data = await readJson<{ error?: string }>(res);
        throw new Error(data.error ?? 'İşlem başarısız.');
      }
      poll(run.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  }

  const selectImage = (index: number) => postStep('/api/pipeline/select-image', { index });
  const approveSeo = (seo: SeoData) => postStep('/api/pipeline/approve-seo', { seo });
  const publish = (price: number, thumbnailIndex: number) =>
    postStep('/api/pipeline/publish', { price, thumbnailIndex });
  const pinPinterest = (copy: PinCopy) => postStep('/api/pipeline/publish-pinterest', { ...copy });

  // Tek mockup yeniden üretimi — status awaiting_publish'te kalır; SADECE ilgili küçük resmi
  // spinner'a alıp o mockup URL'i değişene kadar polling eder (global ekran değişmez).
  async function regenerateMockup(index: number) {
    if (!run) return;
    const prevUrl = run.mediaUrls?.mockups?.[index] ?? '';
    setRegenIndex(index);
    setError(null);
    try {
      const res = await fetch('/api/pipeline/regenerate-mockup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: run.id, index }),
      });
      if (!res.ok && res.status !== 202) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Mockup yeniden üretilemedi.');
      }
      // fal kontext kuyruğu bazen ~2dk sürebilir; geniş tut (~5dk).
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const s = await fetch(`/api/pipeline/status/${run.id}`);
        if (!s.ok) continue;
        const data: PipelineRun = await s.json();
        if (data.status === 'error') {
          setError(data.errorMessage ?? 'Mockup yeniden üretilemedi.');
          setRun(data);
          break;
        }
        const next = data.mediaUrls?.mockups?.[index] ?? '';
        if (next && next !== prevUrl) {
          setRun(data);
          break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mockup yeniden üretilemedi.');
    } finally {
      setRegenIndex(null);
    }
  }

  async function reject() {
    if (!run) return;
    setBusy(true);
    try {
      await fetch('/api/pipeline/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: run.id }),
      });
    } finally {
      resetRun(); // girdileri koru, sadece run'ı sıfırla
    }
  }

  const status = run?.status;

  return (
    <div>
      <PageHeader
        title="Üretim & Onay"
        description="Görsel üret, varyasyon seç, SEO'yu düzenle, dosyaları paketle ve onayınla Etsy'ye yayınla. Her adım onayını bekler."
      />

      {run && status !== 'error' ? (
        <Card className="mb-6">
          <Stepper status={status!} />
        </Card>
      ) : null}

      {error ? (
        <Card className="mb-6 border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      ) : null}

      {pollWarning ? (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">{pollWarning}</p>
        </Card>
      ) : null}

      {etsyConnected === false ? (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-900">Etsy bağlı değil</p>
              <p className="mt-1 text-sm text-amber-800">
                Üretebilirsiniz ama son adımda &quot;Etsy&apos;ye yayınla&quot; çalışmaz. Mockup ve dosya
                maliyetini boşa harcamamak için önce bağlanın.
              </p>
            </div>
            <a
              href="/api/auth/etsy/start"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
            >
              Etsy&apos;ye bağlan
            </a>
          </div>
        </Card>
      ) : null}

      {/* Rakip SEO analizi — üretim öncesi ön-adım */}
      {!run ? (
        <CompetitorResearchPanel
          research={research}
          onAnalyzed={setResearch}
          onClear={() => setResearch(null)}
        />
      ) : null}

      {/* Başlangıç formu */}
      {!run ? (
        <Card>
          <label className="block text-sm font-medium text-zinc-700">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Örn. Abstract boho wall art, neutral earthy tones, minimalist composition"
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as ImageModel)}
                className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              >
                <option value="flux">FLUX.1 Kontext [pro] (fal.ai)</option>
                <option value="imagen">Imagen 4 (Google)</option>
              </select>
              {model === 'imagen' && referenceFile ? (
                <p className="mt-1.5 text-xs text-amber-600">
                  Imagen 4 görsel girdisi kabul etmiyor — referans görselli üretim FLUX.1 Kontext ile
                  yapılacak.
                </p>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Varyasyon sayısı</label>
              <select
                value={variations}
                onChange={(e) => setVariations(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} görsel
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-zinc-700">
              Referans görsel <span className="text-zinc-400">(opsiyonel)</span>
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={onReferenceChange}
              className="mt-1.5 block w-full text-sm text-zinc-500 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
            />
            {referencePreview ? (
              <Image
                src={referencePreview}
                alt="Referans önizleme"
                width={96}
                height={96}
                unoptimized
                className="mt-3 size-24 rounded-lg object-cover ring-1 ring-zinc-200"
              />
            ) : null}
            <p className="mt-2 text-xs text-zinc-400">
              Referans görsel modele doğrudan girdi olarak verilir (FLUX.1 Kontext image-to-image), yani
              model görseli gerçekten görür. Birebir kopya çıkmaması için Prompt&apos;un bir değişim
              talimatı olması gerekir — aşağıdaki &quot;Talimat üret&quot; bunu Claude Vision ile hazırlar.
            </p>

            {referenceFile ? (
              <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <label className="block text-sm font-medium text-zinc-700">
                  Ek not <span className="text-zinc-400">(opsiyonel — TR veya EN)</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Örn. evi farklı bir ev gibi tasarla, kahverengi arabayı lacivert yap"
                  className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                />
                <div className="mt-2">
                  <Button
                    variant="secondary"
                    onClick={generateInstruction}
                    disabled={instructing || !referenceFile}
                  >
                    {instructing ? <Spinner /> : null}
                    {instructing ? 'Talimat üretiliyor…' : 'Talimat üret'}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-zinc-400">
                  Üretilen talimat üstteki Prompt kutusuna yazılır; düzenleyip onaylayabilirsiniz.
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-5">
            <Button onClick={generate} disabled={busy || !prompt.trim()}>
              {busy ? <Spinner /> : null}
              {busy ? 'Başlatılıyor…' : `${variations} varyasyon üret`}
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Taslaklar — kaydedilmiş görseller; birinden devam edip yayına gidilebilir */}
      {!run ? (
        <Card className="mt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Taslaklar</h2>
              <p className="text-sm text-zinc-500">
                Kaydedilen görseller. Birinden devam edip (SEO → yayın) doğrudan listeleyebilir veya
                dışarıdan kendi görselini yükleyebilirsin.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-inset ring-zinc-300 transition-colors hover:bg-zinc-50">
              {draftBusy ? <Spinner /> : null}
              Görsel yükle
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={draftBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) uploadDraft(f);
                }}
              />
            </label>
          </div>

          {drafts.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-400">Henüz taslak yok.</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {drafts.map((d) => (
                <div
                  key={d.id}
                  className="group relative overflow-hidden rounded-lg ring-1 ring-zinc-200"
                >
                  <Image
                    src={d.imageUrl}
                    alt="Taslak"
                    width={300}
                    height={400}
                    unoptimized
                    className="aspect-[3/4] w-full object-cover"
                  />
                  <button
                    onClick={() => deleteDraft(d.id)}
                    disabled={draftBusy}
                    title="Taslağı sil"
                    className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-white/90 text-sm font-semibold text-zinc-600 shadow-sm ring-1 ring-zinc-200 transition hover:bg-white hover:text-red-600 disabled:opacity-60"
                  >
                    ×
                  </button>
                  <div className="absolute inset-x-0 bottom-0 p-1.5">
                    <Button
                      onClick={() => continueFromDraft(d.id)}
                      disabled={draftBusy}
                      className="w-full !px-2 !py-1.5 text-xs"
                    >
                      Bu taslakla devam et
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {/* Sistem çalışıyor */}
      {status && WORKING.includes(status) ? (
        <Card className="flex items-center gap-3 text-zinc-600">
          <Spinner className="text-rose-600" />
          {STATUS_META[status].label}…
        </Card>
      ) : null}

      {/* Kapı 1 — varyasyon seçimi */}
      {status === 'awaiting_approval' && run?.variationUrls?.length ? (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-zinc-900">Görsel seç</h2>
          <p className="mb-4 text-sm text-zinc-500">
            En beğendiğin varyasyona tıkla; SEO o görsele göre üretilecek.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {run.variationUrls.map((url, i) => (
              <div
                key={i}
                className="group relative overflow-hidden rounded-lg ring-1 ring-zinc-200 transition hover:ring-2 hover:ring-rose-500"
              >
                <button
                  onClick={() => selectImage(i)}
                  disabled={busy}
                  className="block w-full disabled:opacity-50"
                >
                  <Image
                    src={url}
                    alt={`Varyasyon ${i + 1}`}
                    width={300}
                    height={400}
                    unoptimized
                    className="aspect-[3/4] w-full object-cover"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-black/50 py-1 text-center text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                    Bu görseli seç
                  </span>
                </button>
                <button
                  onClick={() => saveVariation(i, url)}
                  disabled={savedVariations.has(i)}
                  className="absolute right-1.5 top-1.5 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-200 transition hover:bg-white disabled:opacity-80"
                >
                  {savedVariations.has(i) ? '✓ Kaydedildi' : 'Kaydet'}
                </button>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <Button variant="danger" onClick={reject} disabled={busy}>
              Reddet / baştan başla
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Kapı 2 — SEO inceleme/düzenleme */}
      {status === 'awaiting_seo_approval' && run?.seo ? (
        <SeoEditor
          initial={run.seo}
          image={run.generatedImageUrl ?? null}
          busy={busy}
          onApprove={approveSeo}
          onReject={reject}
        />
      ) : null}

      {/* Kapı 3 — yayın onayı */}
      {status === 'awaiting_publish' && run ? (
        <PublishReview
          run={run}
          busy={busy}
          regenIndex={regenIndex}
          onPublish={publish}
          onRegenerate={regenerateMockup}
          onReject={reject}
        />
      ) : null}

      {/* Tamamlandı */}
      {status === 'done' && run ? (
        <DoneView run={run} onReset={reset} onPinPinterest={pinPinterest} pinning={busy} />
      ) : null}

      {/* Hata */}
      {status === 'error' && run ? (
        <Card>
          <div className="flex items-center gap-2 text-red-700">
            <span className="grid size-7 place-items-center rounded-full bg-red-100 text-sm">!</span>
            <h2 className="text-lg font-semibold">Hata</h2>
          </div>
          <p className="mt-3 text-sm text-zinc-600">{run.errorMessage}</p>
          {canResume ? (
            <p className="mt-2 text-sm text-zinc-500">
              Üretilmiş çıktılar (görsel, SEO, mockup, dosyalar) duruyor. Hatanın sebebini
              giderdiyseniz bu run&apos;ı baştan üretmeden kaldığı adımdan sürdürebilirsiniz.
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            {canResume ? (
              <Button onClick={resumeRun} disabled={busy}>
                {busy ? <Spinner /> : null} Kaldığı adımdan sürdür
              </Button>
            ) : null}
            <Button variant={canResume ? 'ghost' : 'primary'} onClick={reset}>
              Yeni üretim
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function SeoEditor({
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

function PublishReview({
  run,
  busy,
  regenIndex,
  onPublish,
  onRegenerate,
  onReject,
}: {
  run: PipelineRun;
  busy: boolean;
  regenIndex: number | null;
  onPublish: (price: number, thumbnailIndex: number) => void;
  onRegenerate: (index: number) => void;
  onReject: () => void;
}) {
  const [price, setPrice] = useState(5.0);
  const files = run.digitalFileUrls ? Object.entries(run.digitalFileUrls) : [];
  const mockups = run.mediaUrls?.mockups ?? [];
  const filledMockups = mockups.filter(Boolean).length;
  const imageCount = filledMockups + (run.mediaUrls?.sizeGuide ? 1 : 0);

  // Thumbnail = ilk dolu mockup (varsayılan). Kullanıcı değiştirebilir.
  const firstFilled = mockups.findIndex(Boolean);
  const [thumbnailIndex, setThumbnailIndex] = useState(firstFilled >= 0 ? firstFilled : 0);

  return (
    <Card>
      <h2 className="text-lg font-semibold text-zinc-900">Yayın onayı</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Onaylayınca Etsy taslak listing&apos;i oluşturulur: {imageCount} görsel
        {run.mediaUrls?.video ? ' + 1 video' : ''} + {files.length} JPG yüklenir, öznitelikler yazılır ve
        listing <strong>aktif</strong> edilir. <strong>Thumbnail</strong> seçtiğin mockup olur.
      </p>

      <PipelineWarnings run={run} />

      {/* Mockup'lar */}
      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Mockup&apos;lar ({filledMockups}/8) — thumbnail seç ⭐ veya beğenmediğini yeniden üret ↻
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => {
            const url = mockups[i];
            const isThumb = thumbnailIndex === i && Boolean(url);
            const isRegen = regenIndex === i;
            return (
              <div
                key={i}
                className={`overflow-hidden rounded-lg ring-1 ${
                  isThumb ? 'ring-2 ring-rose-500' : 'ring-zinc-200'
                }`}
              >
                <button
                  onClick={() => url && setThumbnailIndex(i)}
                  disabled={!url}
                  className="relative block w-full"
                >
                  {url ? (
                    <Image
                      src={url}
                      alt={`Mockup ${i + 1}`}
                      width={300}
                      height={225}
                      unoptimized
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <div className="grid aspect-[4/3] w-full place-items-center bg-zinc-100 text-xs text-zinc-400">
                      boş
                    </div>
                  )}
                  {isRegen ? (
                    <span className="absolute inset-0 grid place-items-center bg-white/70">
                      <Spinner className="text-rose-600" />
                    </span>
                  ) : null}
                  {isThumb ? (
                    <span className="absolute left-1 top-1 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      ⭐ Thumbnail
                    </span>
                  ) : null}
                </button>
                <button
                  onClick={() => onRegenerate(i)}
                  disabled={busy || isRegen || regenIndex !== null}
                  className="w-full bg-zinc-50 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                >
                  {isRegen ? 'Üretiliyor…' : '↻ Yeniden üret'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Video + ölçü görseli */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Zoom video</p>
          {run.mediaUrls?.video ? (
            <>
              <video src={run.mediaUrls.video} controls className="mt-2 w-full rounded-lg ring-1 ring-zinc-200" />
              <a
                href={run.mediaUrls.video}
                download
                className="mt-1 inline-block text-sm text-rose-600 hover:underline"
              >
                mp4 indir
              </a>
            </>
          ) : (
            <p className="mt-2 text-sm text-amber-700">
              yok — video üretilemedi. Yayın devam eder ama listing videosuz olur.
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Ölçü görseli</p>
          {run.mediaUrls?.sizeGuide ? (
            <Image
              src={run.mediaUrls.sizeGuide}
              alt="Ölçü görseli"
              width={300}
              height={300}
              unoptimized
              className="mt-2 w-full rounded-lg object-contain ring-1 ring-zinc-200"
            />
          ) : (
            <p className="mt-2 text-sm text-zinc-400">
              yok — <code>public/templates/size-guide.png</code> ekleyin
            </p>
          )}
        </div>
      </div>

      {/* Dijital dosyalar */}
      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Dijital dosyalar (5 JPG, 300 DPI)</p>
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {files.map(([key, url]) => (
            <li key={key} className="text-sm">
              <a href={url} target="_blank" rel="noreferrer" className="text-rose-600 hover:underline">
                {key.replace('ratio_', '').replace('x', ':')}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {run.seo ? <SeoSummary seo={run.seo} /> : null}

      <div className="mt-5 flex items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-zinc-700">Fiyat (USD)</label>
          <input
            type="number"
            min={0.2}
            step={0.5}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="mt-1.5 w-28 rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
        </div>
        <Button onClick={() => onPublish(price, thumbnailIndex)} disabled={busy || imageCount === 0 || regenIndex !== null}>
          {busy ? <Spinner /> : null}
          Etsy&apos;ye yayınla
        </Button>
        <Button variant="ghost" onClick={onReject} disabled={busy}>
          İptal
        </Button>
      </div>
      {imageCount === 0 ? (
        <p className="mt-2 text-xs text-amber-600">
          Etsy en az 1 görsel ister. fal kredisi gelince mockup üret ya da ölçü görseli ekle.
        </p>
      ) : null}
    </Card>
  );
}

/**
 * Yayını bloklamayan uyarılar (örn. "Etsy videoyu kabul etmedi"). Bunlar eskiden yalnızca
 * sunucu loguna yazılıyordu; kullanıcı listing'de video olmadığını görüyor ama sebebini
 * öğrenemiyordu. Artık gate 3 ve "Yayınlandı" ekranında görünür.
 */
function PipelineWarnings({ run }: { run: PipelineRun }) {
  const warnings = run.publishProgress?.warnings ?? [];
  if (warnings.length === 0) return null;
  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-medium text-amber-900">Dikkat edilmesi gerekenler</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-800">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

function DoneView({
  run,
  onReset,
  onPinPinterest,
  pinning,
}: {
  run: PipelineRun;
  onReset: () => void;
  onPinPinterest: (copy: PinCopy) => void;
  pinning: boolean;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-green-700">
        <span className="grid size-7 place-items-center rounded-full bg-green-100 text-sm">✓</span>
        <h2 className="text-lg font-semibold">Yayınlandı</h2>
      </div>
      <PipelineWarnings run={run} />
      <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-zinc-50 px-4 py-3">
          <dt className="text-zinc-500">Etsy Listing ID</dt>
          <dd className="font-mono text-zinc-900">{run.etsyListingId ?? '—'}</dd>
        </div>
        <div className="rounded-lg bg-zinc-50 px-4 py-3">
          <dt className="text-zinc-500">Dijital dosyalar</dt>
          <dd className="text-zinc-900">
            {run.digitalFileUrls ? Object.keys(run.digitalFileUrls).length : 0} JPG
          </dd>
        </div>
      </dl>
      {run.seo ? <SeoSummary seo={run.seo} /> : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={onReset}>Yeni üretim</Button>
        {run.pinterestPinId ? (
          <a
            href={`https://www.pinterest.com/pin/${run.pinterestPinId}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-rose-600 hover:text-rose-700"
          >
            ✓ Pinterest&apos;te pinlendi →
          </a>
        ) : null}
      </div>

      {run.pinterestPinId ? null : (
        <PinterestPanel runId={run.id} onPin={onPinPinterest} pinning={pinning} />
      )}
    </Card>
  );
}

/**
 * Pinterest pin onay kapısı: metni Claude üretir, kullanıcı DÜZENLEYİP onaylar, sonra pinlenir.
 * Etsy listing'i taslak bırakıldığı için pin otomatik zincirlenmez — kullanıcı listing'i
 * Etsy panelinden aktive ettikten sonra buradan tetikler (ölü linke pin atılmasın).
 */
function PinterestPanel({
  runId,
  onPin,
  pinning,
}: {
  runId: string;
  onPin: (copy: PinCopy) => void;
  pinning: boolean;
}) {
  const [copy, setCopy] = useState<PinCopy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function prepare() {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const res = await fetch('/api/pipeline/pin-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: runId }),
      });
      const data = await readJson<{ copy?: PinCopy; warning?: string; error?: string }>(res);
      if (!res.ok || !data.copy) throw new Error(data.error ?? 'Pin metni alınamadı.');
      setCopy(data.copy);
      if (data.warning) setWarning(data.warning);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pin metni alınamadı.');
    } finally {
      setLoading(false);
    }
  }

  if (!copy) {
    return (
      <div className="mt-5 border-t border-zinc-100 pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={() => void prepare()} disabled={loading}>
            {loading ? <Spinner /> : null}
            {loading ? 'Metin hazırlanıyor…' : "Pinterest'te pinle"}
          </Button>
          <a href="/api/auth/pinterest/start" className="text-xs text-zinc-400 hover:text-zinc-600">
            Pinterest hesabını bağla
          </a>
        </div>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      </div>
    );
  }

  const update = (patch: Partial<PinCopy>) => setCopy({ ...copy, ...patch });

  return (
    <div className="mt-5 border-t border-zinc-100 pt-5">
      <h3 className="text-sm font-semibold text-zinc-900">Pinterest pin metni</h3>
      <p className="mt-1 text-sm text-zinc-500">
        Pinlemeden önce düzenleyebilirsiniz. Pin, Etsy listing&apos;ine bağlanır — listing&apos;i
        Etsy panelinden aktive ettiğinizden emin olun.
      </p>
      {warning ? <p className="mt-2 text-sm text-amber-700">{warning}</p> : null}

      <div className="mt-3 space-y-3">
        <LabeledField label="Başlık" hint={`${copy.title.length}/100`}>
          <input
            value={copy.title}
            maxLength={100}
            onChange={(e) => update({ title: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </LabeledField>
        <LabeledField label="Açıklama" hint={`${copy.description.length}/500`}>
          <textarea
            value={copy.description}
            maxLength={500}
            rows={4}
            onChange={(e) => update({ description: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </LabeledField>
        <LabeledField label="Alternatif metin (erişilebilirlik)" hint={`${copy.altText.length}/500`}>
          <textarea
            value={copy.altText}
            maxLength={500}
            rows={2}
            onChange={(e) => update({ altText: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </LabeledField>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => onPin(copy)} disabled={pinning || !copy.title.trim()}>
          {pinning ? <Spinner /> : null}
          {pinning ? 'Pinleniyor…' : 'Onayla ve pinle'}
        </Button>
        <Button variant="ghost" onClick={() => void prepare()} disabled={loading || pinning}>
          {loading ? <Spinner /> : null}
          Metni yeniden üret
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

function LabeledField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-sm font-medium text-zinc-700">{label}</label>
        {hint ? <span className="text-xs text-zinc-400">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function CompetitorResearchPanel({
  research,
  onAnalyzed,
  onClear,
}: {
  research: CompetitorAnalysis | null;
  onAnalyzed: (r: CompetitorAnalysis) => void;
  onClear: () => void;
}) {
  const [url, setUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function analyze() {
    if (!url.trim()) return;
    setAnalyzing(true);
    setErr(null);
    try {
      const res = await fetch('/api/competitor-research/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Analiz başarısız.');
      onAnalyzed(data as CompetitorAnalysis);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Analiz başarısız.');
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <Card className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Rakip SEO Analizi <span className="text-sm font-normal text-zinc-400">(opsiyonel)</span></h2>
          <p className="text-sm text-zinc-500">
            İyi performans gösteren bir Etsy ürününün linkini gir; sistem o nişten özgün SEO çıkarsın.
            Bağlarsan, SEO seçtiğin görsele göre üretilirken bu nişe/keyword&apos;lere yönlendirilir.
          </p>
        </div>
        {research ? (
          <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
            Bağlı #{research.id}
          </span>
        ) : null}
      </div>

      {!research ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.etsy.com/listing/123456789/..."
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
          <Button onClick={analyze} disabled={analyzing || !url.trim()}>
            {analyzing ? <Spinner /> : null}
            {analyzing ? 'Analiz ediliyor…' : 'Analiz Et'}
          </Button>
        </div>
      ) : null}

      {err ? <p className="mt-3 text-sm text-red-700">{err}</p> : null}

      {research ? (
        <div className="mt-4 space-y-4 border-t border-zinc-100 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Kaynak (rakip)</p>
              <p className="mt-1 text-sm text-zinc-800">{research.source.title}</p>
              <p className="mt-1 text-xs text-zinc-500">
                ❤ {research.source.numFavorers} favori · {research.source.views} görüntülenme · taxonomy{' '}
                {research.source.taxonomyId || '—'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {research.source.tags.map((t, i) => (
                  <span key={i} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-rose-500">Üretilen (özgün)</p>
              <p className="mt-1 text-sm font-medium text-zinc-900">{research.generated.title}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {research.generated.tags.map((t, i) => (
                  <span key={i} className="rounded-md bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Üretilen açıklama</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{research.generated.description}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">
              Bu analiz üretime bağlandı; aşağıdan prompt girip başlayabilirsin.
            </span>
            <Button variant="ghost" onClick={onClear}>
              Bağı kaldır
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function SeoSummary({ seo }: { seo: NonNullable<PipelineRun['seo']> }) {
  return (
    <div className="mt-5 space-y-3 border-t border-zinc-100 pt-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Başlık</p>
        <p className="text-sm text-zinc-800">{seo.title}</p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Etiketler</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {seo.tags.map((t, i) => (
            <span key={i} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
