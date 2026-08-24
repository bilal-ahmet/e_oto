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
 * Aktif link DOLGU ile değil ALTIN ÇİZGİ ile işaretlenir — dolgu gri hap, kâğıt
 * zeminde bir "buton" gibi okunup tıklanabilir sanılıyordu.
 */
export function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-sand bg-paper">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6 lg:px-8">
        <Link
          href="/admin"
          className="flex shrink-0 items-baseline gap-2 font-display text-lg tracking-tight text-ink"
        >
          Velora
          <span className="font-mono text-label uppercase tracking-label text-ink-faint">
            Panel
          </span>
        </Link>

        {/* Dar ekranda linkler yatay şeride döner — 4 link 375px'te sıkışıyordu. */}
        <nav className="-mb-4 flex min-w-0 flex-1 items-center gap-5 overflow-x-auto pb-4">
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`shrink-0 border-b-2 pb-1 font-mono text-label uppercase tracking-label transition-colors ${
                  active
                    ? 'border-gold text-ink'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <a
          href="/"
          className="shrink-0 rounded-full border border-ink px-4 py-1.5 font-mono text-label uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-paper"
        >
          Mağaza sitesi
        </a>
      </div>
    </header>
  );
}
