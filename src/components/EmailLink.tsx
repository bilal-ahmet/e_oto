interface EmailLinkProps {
  email: string;
  className?: string;
}

/**
 * Site Cloudflare üzerinden proxy'leniyorsa, Cloudflare'in "Email Address Obfuscation"
 * (Scrape Shield) özelliği kaynak HTML'deki düz e-posta adreslerini otomatik maskeler
 * (`/cdn-cgi/l/email-protection`) — JS çalışmayan bir görüntüleyici (reviewer/bot) adresi
 * kaynakta göremez. Cloudflare'in resmi istisna işaretleyicisi `<!--email_off-->` bunu
 * dashboard ayarına dokunmadan devre dışı bırakır.
 */
export function EmailLink({ email, className }: EmailLinkProps) {
  return (
    <a
      href={`mailto:${email}`}
      className={className}
      dangerouslySetInnerHTML={{ __html: `<!--email_off-->${email}<!--/email_off-->` }}
    />
  );
}
