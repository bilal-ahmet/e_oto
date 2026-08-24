'use client';

/**
 * Uretim ekrani — TUM state, polling ve fetch mantiginin TEK sahibi.
 *
 * Gorsel bolumler `_components/` altinda; bu dosya yalnizca veriyi ve akisi yonetir,
 * kompozisyonu kurar. `_` onekli klasor App Router'da route segmenti DEGILDIR.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { ImageDraft, ImageModel, PinCopy, PipelineRun, ProductType, SeoData } from '@/types';
import { Alert, Button, Card, EmptyState, FRAMED_IMG, Framed, LinkButton, PageHeader, Spinner } from '@/components/ui';
import {
  PRODUCT_OPTIONS,
  WORKING,
  fileToBase64,
  previewAspectClass,
  readJson,
  type CompetitorAnalysis,
} from './_components/shared';
import { Stepper } from './_components/GateRail';
import { WorkingPanel } from './_components/WorkingPanel';
import { SeoEditor } from './_components/SeoEditor';
import { PublishReview } from './_components/PublishReview';
import { DoneView } from './_components/DoneView';
import { CompetitorResearchPanel } from './_components/CompetitorStrip';

export default function GeneratePage() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<ImageModel>('flux');
  const [productType, setProductType] = useState<ProductType>('print');
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
          productType,
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
        eyebrow="Üretim hattı"
        title="Üretim & Onay"
        description="Dört adım, her biri senin onayını bekler. Sistem hiçbir kapıyı sen görmeden geçmez."
      />

      {/* Ray artık HER ZAMAN görünür (üretim başlamadan da) — kullanıcı kaç adım
          olduğunu ve nerede durduğunu ilk ekranda görüyor. */}
      <div className="-mx-4 mb-8 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Stepper status={status ?? 'idle'} />
      </div>

      {error ? (
        <Alert tone="danger" className="mb-6">
          {error}
        </Alert>
      ) : null}

      {pollWarning ? (
        <Alert tone="warning" className="mb-6">
          {pollWarning}
        </Alert>
      ) : null}

      {etsyConnected === false ? (
        <Alert
          tone="warning"
          title="Etsy bağlı değil"
          className="mb-6"
          action={
            <LinkButton href="/api/auth/etsy/start" prefetch={false} variant="secondary" size="sm">
              Etsy&apos;ye bağlan
            </LinkButton>
          }
        >
          Üretebilirsin ama son adımda &quot;Etsy&apos;ye yayınla&quot; çalışmaz. Mockup ve dosya
          maliyetini boşa harcamamak için önce bağlan.
        </Alert>
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
          <label className="block text-sm font-medium text-ink-body">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Örn. Abstract boho wall art, neutral earthy tones, minimalist composition"
            className="mt-1.5 w-full rounded-xs border border-sand bg-sheet px-3 py-2 text-sm text-ink transition-colors hover:border-ink/40"
          />

          <div className="mt-4">
            <label className="block text-sm font-medium text-ink-body">Ürün tipi</label>
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value as ProductType)}
              className="mt-1.5 w-full rounded-xs border border-sand bg-sheet px-3 py-2 text-sm text-ink transition-colors hover:border-ink/40"
            >
              {PRODUCT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {productType === 'tv' ? (
              <p className="mt-1.5 text-xs text-ink-muted">
                Frame TV: görsel <strong>16:9 yatay</strong> üretilir; 2 JPG (4K 3840×2160 + Full HD 1920×1080),
                ekran açıklaması, 4 TV + 4 çerçeve mockup, 16:9 video. Ölçü görseli eklenmez.
              </p>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-ink-body">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as ImageModel)}
                className="mt-1.5 w-full rounded-xs border border-sand bg-sheet px-3 py-2 text-sm text-ink transition-colors hover:border-ink/40"
              >
                <option value="flux">FLUX.1 Kontext [pro] (fal.ai)</option>
                <option value="imagen">Imagen 4 (Google)</option>
              </select>
              {model === 'imagen' && referenceFile ? (
                <p className="mt-1.5 text-xs text-gold-deep">
                  Imagen 4 görsel girdisi kabul etmiyor — referans görselli üretim FLUX.1 Kontext ile
                  yapılacak.
                </p>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-body">Varyasyon sayısı</label>
              <select
                value={variations}
                onChange={(e) => setVariations(Number(e.target.value))}
                className="mt-1.5 w-full rounded-xs border border-sand bg-sheet px-3 py-2 text-sm text-ink transition-colors hover:border-ink/40"
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
            <label className="block text-sm font-medium text-ink-body">
              Referans görsel <span className="text-ink-faint">(opsiyonel)</span>
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={onReferenceChange}
              className="mt-1.5 block w-full text-sm text-ink-muted file:mr-4 file:rounded-lg file:border-0 file:bg-shade file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink-body hover:file:bg-sand"
            />
            {referencePreview ? (
              <Framed mat="sm" ratio="aspect-square" className="mt-3 w-24">
                <Image
                  src={referencePreview}
                  alt="Referans önizleme"
                  width={96}
                  height={96}
                  unoptimized
                  className={FRAMED_IMG}
                />
              </Framed>
            ) : null}
            <p className="mt-2 text-xs text-ink-faint">
              Referans görsel modele doğrudan girdi olarak verilir (FLUX.1 Kontext image-to-image), yani
              model görseli gerçekten görür. Birebir kopya çıkmaması için Prompt&apos;un bir değişim
              talimatı olması gerekir — aşağıdaki &quot;Talimat üret&quot; bunu Claude Vision ile hazırlar.
            </p>

            {referenceFile ? (
              <div className="mt-4 rounded-lg border border-sand bg-shade p-3">
                <label className="block text-sm font-medium text-ink-body">
                  Ek not <span className="text-ink-faint">(opsiyonel — TR veya EN)</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Örn. evi farklı bir ev gibi tasarla, kahverengi arabayı lacivert yap"
                  className="mt-1.5 w-full rounded-xs border border-sand bg-sheet px-3 py-2 text-sm text-ink transition-colors hover:border-ink/40"
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
                <p className="mt-2 text-xs text-ink-faint">
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
              <h2 className="text-lg font-semibold text-ink">Taslaklar</h2>
              <p className="text-sm text-ink-muted">
                Kaydedilen görseller. Birinden devam edip (SEO → yayın) doğrudan listeleyebilir veya
                dışarıdan kendi görselini yükleyebilirsin.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-sheet px-4 py-2 text-sm font-medium text-ink-body ring-1 ring-inset ring-sand transition-colors hover:bg-shade">
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
            <EmptyState
              title="Henüz taslak yok"
              description="Beğendiğin bir varyasyonu kaydedince burada birikir."
            />
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {drafts.map((d) => (
                <div key={d.id}>
                  <div className="relative">
                    <Framed>
                      <Image
                        src={d.imageUrl}
                        alt="Taslak"
                        width={300}
                        height={400}
                        unoptimized
                        className={FRAMED_IMG}
                      />
                    </Framed>
                    <button
                      onClick={() => deleteDraft(d.id)}
                      disabled={draftBusy}
                      title="Taslağı sil"
                      aria-label="Taslağı sil"
                      className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-paper text-sm font-semibold text-ink-muted transition-colors hover:text-state-error-ink disabled:opacity-60"
                    >
                      ×
                    </button>
                  </div>
                  <div>
                    <Button
                      onClick={() => continueFromDraft(d.id)}
                      disabled={draftBusy}
                      size="sm"
                      className="mt-2 w-full"
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

      {/* Sistem çalışıyor — kapı no, ne yapıldığı, geçen süre ve normal süre. */}
      {/* key={status}: adim degisince bilesen yeniden monte olur, sayac 0dan baslar. */}
      {status && WORKING.includes(status) ? <WorkingPanel key={status} status={status} /> : null}

      {/* Kapı 1 — varyasyon seçimi */}
      {status === 'awaiting_approval' && run?.variationUrls?.length ? (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-ink">Görsel seç</h2>
          <p className="mb-4 text-sm text-ink-muted">
            En beğendiğin varyasyona tıkla; SEO o görsele göre üretilecek.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {run.variationUrls.map((url, i) => (
              <div key={i} className="group">
                <div className="relative">
                  <button
                    onClick={() => selectImage(i)}
                    disabled={busy}
                    className="block w-full disabled:opacity-50"
                    aria-label={`Varyasyon ${i + 1} görselini seç`}
                  >
                    <Framed ratio={previewAspectClass(run.productType)}>
                      <Image
                        src={url}
                        alt={`Varyasyon ${i + 1}`}
                        width={300}
                        height={400}
                        unoptimized
                        className={FRAMED_IMG}
                      />
                      {/* group-focus-within: klavye kullanicisi bu ipucunu eskiden HIC
                          goremiyordu — yalnizca hover'da beliriyordu. */}
                      <span className="absolute inset-x-0 bottom-0 bg-paper/90 py-1 text-center font-mono text-label uppercase tracking-label text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        Bu görseli seç
                      </span>
                    </Framed>
                  </button>
                  <button
                    onClick={() => saveVariation(i, url)}
                    disabled={savedVariations.has(i)}
                    className="absolute right-1 top-1 rounded-full bg-paper px-2 py-0.5 font-mono text-label uppercase tracking-label text-ink-muted transition-colors hover:text-ink disabled:opacity-80"
                  >
                    {savedVariations.has(i) ? '✓ Kaydedildi' : 'Kaydet'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5">
            {/* Uc kapida da AYNI eylem, ayni isim ve ayni varyant. `danger` yalnizca
                geri alinamaz, veri silen isler icin ayrildi (bkz. ui.tsx). */}
            <Button variant="ghost" onClick={reject} disabled={busy}>
              Bu üretimi bırak
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Kapı 2 — SEO inceleme/düzenleme */}
      {status === 'awaiting_seo_approval' && run?.seo ? (
        <SeoEditor
          initial={run.seo}
          image={run.generatedImageUrl ?? null}
          productType={run.productType}
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
          <div className="flex items-center gap-2 text-state-error-ink">
            <span className="grid size-7 place-items-center rounded-full bg-state-error text-sm">!</span>
            <h2 className="text-lg font-semibold">Hata</h2>
          </div>
          <p className="mt-3 text-sm text-ink-body">{run.errorMessage}</p>
          {canResume ? (
            <p className="mt-2 text-sm text-ink-muted">
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
