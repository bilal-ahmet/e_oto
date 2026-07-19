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

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4 sm:px-6">
        <Link href="/admin" className="mr-4 flex items-center gap-2 font-semibold text-zinc-900">
          <span className="grid size-7 place-items-center rounded-md bg-rose-600 text-sm text-white">
            E
          </span>
          Etsy AI Otomasyon
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-zinc-100 text-zinc-900'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
