'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin', label: 'Panel' },
  { href: '/admin/generate', label: 'Üretim' },
  { href: '/admin/drafts', label: 'Taslaklar' },
  { href: '/admin/competitors', label: 'Rakip Analizi' },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
}

/**
 * Panel üst barı — marka sitesinin header'ıyla aynı ritim ve şekil dili
 * (bkz. src/app/(marketing)/layout.tsx): kâğıt zemin, kum çizgi, serif marka adı,
 * mono etiketler, sağda hap bağlantı.
 *
 * Aktif link DOLGU ile değil ALTIN ÇİZGİ + koyu metin ile işaretlenir — dolgu gri hap
 * bir "buton" gibi okunup tıklanabilir sanılıyordu.
 * Bağlantılar düz yazı, cümle düzeninde: büyük harf mono etiketler küçük puntoda zor okunuyordu.
 */
export function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-sand bg-sheet">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 sm:px-6 lg:px-8">
        <Link
          href="/admin"
          className="flex shrink-0 items-baseline gap-2 py-4 font-display text-xl tracking-tight text-ink"
        >
          Velora
          <span className="text-sm font-normal text-ink-faint">Panel</span>
        </Link>

        {/* Dar ekranda linkler yatay şeride döner — 4 link 375px'te sıkışıyordu. */}
        <nav className="flex min-w-0 flex-1 items-stretch gap-1 self-stretch overflow-x-auto">
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 items-center border-b-[3px] px-3 py-3 text-sm transition-colors ${
                  active
                    ? 'border-gold font-semibold text-ink'
                    : 'border-transparent font-medium text-ink-muted hover:border-sand hover:text-ink'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 py-3">
          <Link
            href="/"
            className="rounded-full border border-field px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-shade"
          >
            Mağaza sitesi
          </Link>

          {/*
            Düz form + POST: JS olmadan da çalışır ve çıkış çerezi SUNUCUDA silinir.
            GET bağlantısı olsaydı tarayıcı/proxy önbelleği ya da link ön-getirme oturumu
            istemeden kapatabilirdi.
          */}
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-shade hover:text-ink"
            >
              Çıkış
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
