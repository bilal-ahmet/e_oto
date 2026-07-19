import type { Metadata } from 'next';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Privacy Policy — Velora Art Designs',
};

const CONTACT_EMAIL = env.CONTACT_EMAIL ?? 'contact@bbfcreative.com.tr';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-[family-name:var(--font-fraunces)] text-xl tracking-tight text-[#241f1c]">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-[#4a4238]">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 sm:px-8">
      <div className="inline-flex items-center gap-2 rounded-full border border-[#9c7a3c]/40 bg-[#9c7a3c]/10 px-3 py-1 font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-[0.16em] text-[#7a5f2f]">
        Legal
      </div>
      <h1 className="mt-4 font-[family-name:var(--font-fraunces)] text-3xl tracking-tight text-[#241f1c]">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-[#7a715f]">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

      <p className="mt-6 text-sm leading-relaxed text-[#4a4238]">
        Velora Art Designs (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates this website and sells
        original printable wall art through our Etsy shop. This page explains
        how we use the Pinterest API and how we handle data in connection
        with that use.
      </p>

      <Section title="How we use the Pinterest API">
        <p>
          We use the Pinterest API to publish Pins on our own Pinterest
          account, promoting our own product listings. Each Pin links back to
          the corresponding product on our Etsy shop. We do not use the
          Pinterest API to access, collect, or act on behalf of any Pinterest
          account other than our own business account.
        </p>
      </Section>

      <Section title="No affiliation with Pinterest">
        <p>
          Velora Art Designs is not affiliated with, endorsed by, or
          sponsored by Pinterest, Inc. &ldquo;Pinterest&rdquo; and related
          marks are trademarks of Pinterest, Inc. Our use of the Pinterest
          API is limited to publishing content to our own account under
          Pinterest&rsquo;s developer terms.
        </p>
      </Section>

      <Section title="Data we collect and how we use it">
        <p>
          When we connect our Pinterest account to our systems, Pinterest
          issues us an access token used solely to publish Pins on our own
          behalf. We do not collect personal data from Pinterest users, and
          we do not sell, rent, or share any data obtained through the
          Pinterest API with third parties. Any data stored (such as
          authentication tokens) is encrypted at rest and used only to
          operate this integration.
        </p>
      </Section>

      <Section title="Other data">
        <p>
          If you contact us by email, we use your message and email address
          only to respond to you. We do not use website analytics or
          advertising trackers that sell personal data.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy or our use of the Pinterest API can be
          sent to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2 hover:text-[#241f1c]">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </div>
  );
}
