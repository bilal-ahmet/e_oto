# Pinterest Standard access başvurusu

`pinterest-publishing` skill'inin devamı. Trial → Standard geçişi, sandbox tuzağını ortadan
kaldıran tek adımdır (pinler herkese açık olur, `PINTEREST_API_ENV=production`).

## Başvuru

developers.pinterest.com/apps → Upgrade.

**Şart: tek kesintisiz demo videosu.** Aynı kayıtta sırayla görünmeli:

1. OAuth yetkilendirme ekranı
2. token alınması
3. o token'la gerçek pin oluşturma

Token'ın hazır olduğu yerden başlayan video reddedilir.

Ayrıca herkese açık bir gizlilik politikası URL'i gerekir — `/privacy` bunu karşılıyor.

## Onaylandıktan sonra

`.do/app.yaml`'daki `PINTEREST_API_ENV` değerini `production` yap, ardından:

- Pinterest'i **yeniden yetkilendir** (sandbox token'ı production'da geçersizdir),
- board'u panelden **tekrar seç** (sandbox board id'leri production'da yok).

Güncel başvuru durumu: `DOCS/mimari.md`.
