/**
 * Uygulamanın TEK font tanımı yeri.
 *
 * NEDEN BURADA: `next/font` fonksiyonlarının her çağrısı AYRI bir font örneği barındırır
 * (Next dokümanı: "you should load it in one place and import the related font object").
 * Fraunces eskiden `(marketing)/layout.tsx` içinde çağrılıyordu; panel de kullanacağı için
 * ikinci bir çağrı ikinci bir örnek üretecekti. Artık üçü de burada tanımlanır, root layout
 * `<html>`'e uygular ve her iki bölüm de aynı örneği paylaşır.
 *
 * `axes: ['opsz']` KORUNMALI — marka sitesinin başlık render'ı Fraunces'in optik boy
 * eksenine bağlı; düşerse canlı sitenin tipografisi sessizce değişir.
 */

import { Fraunces, Geist, Geist_Mono } from 'next/font/google';

export const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

export const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  axes: ['opsz'],
});

/** Üç font değişkenini birden uygulamak için — root layout `<html>`'de kullanır. */
export const fontVariables = `${geistSans.variable} ${geistMono.variable} ${fraunces.variable}`;
