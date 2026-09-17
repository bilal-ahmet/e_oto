/**
 * Panel içi fetch sarmalayıcısı — 401 gelince giriş sayfasına götürür.
 *
 * NEDEN: oturumu dolmuş ya da başka sekmeden çıkış yapılmış bir panel sekmesi API'ye
 * istek attığında `src/proxy.ts` 401 döner. Ham `fetch` ile bu, ekranda anlamsız bir hata
 * mesajı olarak görünür ve kullanıcının girişe dönmek için ne yapacağı belli olmaz.
 *
 * Panelden yapılan HER istek bu fonksiyondan geçmeli — `fetch(` doğrudan çağrılmamalı.
 */

/** 401'de tam sayfa gezinmeyle /login'e gider; diğer tüm durumlarda düz fetch gibi davranır. */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);

  if (res.status === 401) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    // replace: geri tuşu oturumu ölmüş sayfaya dönüp aynı 401'i tekrar üretmesin.
    window.location.replace(`/login?next=${next}`);
    // Çağıranın hata yolunu çalıştırmasını engelle — gezinme başladı, ekran zaten değişiyor.
    await new Promise(() => {});
  }

  return res;
}
