import type { MetadataRoute } from 'next';

/**
 * Panelin ve giriş sayfasının arama sonuçlarında görünmesini engeller.
 *
 * Bu YETKİ KONTROLÜ DEĞİL, yalnızca keşfedilebilirliği azaltır — gerçek koruma
 * `src/proxy.ts` + `app/admin/layout.tsx` içindedir. Vitrin sayfaları (`/`, `/privacy`)
 * bilerek indekslenmeye açık bırakılır.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: ['/admin', '/login', '/api/'] },
  };
}
