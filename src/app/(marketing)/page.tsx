import { publicBranding } from '@/lib/env';

const SHOP_URL = `https://www.etsy.com/shop/${publicBranding.shopName}`;

const GALLERY = [
  { no: '01', title: 'Dune Study', from: '#c9a27a', to: '#a9764a' },
  { no: '02', title: 'Botanical Line', from: '#8a9678', to: '#5c6652' },
  { no: '03', title: 'Coastal Horizon', from: '#a9bcc4', to: '#6c8791' },
  { no: '04', title: 'Frame TV Edition', from: '#c98a5e', to: '#9c7a3c' },
];

export default function MarketingHome() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-6 pt-16 pb-14 sm:px-8 sm:pt-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#9c7a3c]/40 bg-[#9c7a3c]/10 px-3 py-1 font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-[0.16em] text-[#7a5f2f]">
          No. 001 — Digital Print Studio
        </div>

        <h1 className="mt-6 max-w-3xl font-[family-name:var(--font-fraunces)] text-4xl leading-[1.1] tracking-tight text-[#241f1c] sm:text-6xl">
          Wall art that fits the room you actually have.
        </h1>

        <p className="mt-6 max-w-xl text-base leading-relaxed text-[#4a4238] sm:text-lg">
          Velora Art Designs makes original printable wall art and Frame TV
          art — instant digital downloads, sized for real frames and real
          rooms, ready to print at home or through your favorite print shop.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <a
            href={SHOP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-[#241f1c] px-6 py-3 text-sm font-medium uppercase tracking-[0.1em] text-[#f1ece2] transition-colors hover:bg-[#3a332c]"
          >
            Shop the collection
          </a>
          <span className="text-sm text-[#7a715f]">Instant download · Print at any size</span>
        </div>
      </section>

      <section className="border-y border-[#ddd2ba] bg-[#ebe4d5]">
        <div className="mx-auto max-w-5xl px-6 py-14 sm:px-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {GALLERY.map((item) => (
              <figure key={item.no}>
                <div
                  className="aspect-[3/4] border-[10px] border-[#f1ece2] outline outline-1 -outline-offset-1 outline-[#241f1c]/70"
                  style={{
                    background: `linear-gradient(160deg, ${item.from}, ${item.to})`,
                  }}
                />
                <figcaption className="mt-3 font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-[0.1em] text-[#5c5347]">
                  No. {item.no} — {item.title}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2">
          <div>
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl tracking-tight text-[#241f1c]">
              About the studio
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[#4a4238]">
              Velora Art Designs is an independent print studio designing
              original wall art for everyday rooms — living rooms, nurseries,
              entryways, and Samsung Frame TVs. Every piece is designed
              in-house and sold exclusively as a digital download on Etsy, so
              you can print it at the size and finish that fits your space.
            </p>
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-fraunces)] text-2xl tracking-tight text-[#241f1c]">
              What you get
            </h2>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[#4a4238]">
              <li>— High-resolution files, 300 DPI, ready for professional printing</li>
              <li>— Multiple print ratios, from small frames to gallery-size prints</li>
              <li>— A dedicated Frame TV crop for select designs</li>
              <li>— Delivered instantly through your Etsy purchase</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
