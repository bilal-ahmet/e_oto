import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';

export const metadata: Metadata = {
  title: 'Etsy AI Otomasyon — Panel',
  description: 'Etsy dijital görsel satışı için uçtan uca AI otomasyon paneli',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}
