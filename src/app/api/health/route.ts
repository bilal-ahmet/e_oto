/**
 * Health check — App Platform sağlık yoklaması bunu kullanır.
 * Kasıtlı olarak HAFİF: env/DB'ye dokunmaz, her zaman hızlı 200 döner (deploy sırasında da).
 */

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok', ts: new Date().toISOString() });
}
