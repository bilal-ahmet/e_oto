import Link from 'next/link';
import { Fraunces } from 'next/font/google';
import { env } from '@/lib/env';

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  axes: ['opsz'],
});

const SHOP_URL = `https://www.etsy.com/shop/${env.ETSY_SHOP_NAME}`;
const CONTACT_EMAIL = env.CONTACT_EMAIL ?? 'contact@bbfcreative.com.tr';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${fraunces.variable} flex min-h-full flex-col bg-[#f1ece2] text-[#241f1c]`}>
      <header className="border-b border-[#ddd2ba]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5 sm:px-8">
          <Link href="/" className="font-[family-name:var(--font-fraunces)] text-lg tracking-tight">
            Velora Art Designs
          </Link>
          <a
            href={SHOP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-[#241f1c] px-4 py-1.5 text-xs font-medium uppercase tracking-[0.12em] transition-colors hover:bg-[#241f1c] hover:text-[#f1ece2]"
          >
            Shop on Etsy
          </a>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-[#ddd2ba]">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-8 text-xs text-[#5c5347] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© {new Date().getFullYear()} {env.ETSY_SHOP_NAME}. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-[#241f1c]">
              Privacy Policy
            </Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-[#241f1c]">
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
