/**
 * Panelde gösterilen zamanlar — saat dilimi AÇIKÇA Europe/Istanbul ve "TSİ" etiketiyle.
 *
 * NEDEN: `toLocaleString` saat dilimi verilmezse sunucunun dilimini kullanır (konteyner UTC'dir);
 * panelde görünen saatin hangi dilimde olduğu belli değildi ve kayıtlar yanlış yorumlanıyordu.
 */
const TZ = 'Europe/Istanbul';

export function formatTr(
  d: Date | string | null | undefined,
  { year = false }: { year?: boolean } = {},
): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return (
    date.toLocaleString('tr-TR', {
      timeZone: TZ,
      day: '2-digit',
      month: 'short',
      ...(year ? { year: 'numeric' } : {}),
      hour: '2-digit',
      minute: '2-digit',
    }) + ' TSİ'
  );
}
