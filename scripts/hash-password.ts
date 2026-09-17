/**
 * Panel parolası için ADMIN_PASSWORD_HASH üretir.
 *
 * Kullanım: npm run auth:hash
 *
 * Parola ARGÜMANDAN DEĞİL stdin'den okunur — argüman olarak verilen parola shell geçmişine
 * ve `ps` çıktısına düşer. Girdi terminaldeyse ekrana yazılmaz.
 */

import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { hashPassword } from '../src/lib/auth/password';

const MIN_LENGTH = 12;

/**
 * Terminalde: parolayı ekrana basmadan, iki kez sorarak okur.
 *
 * readline'a stdout yerine "maskeli" bir akış verilir: `muted` açıkken yazdığı her şeyi yutar,
 * böylece yazılan karakterler görünmez. (readline'ın kendi `output`'una müdahale etmek tip
 * düzeyinde desteklenmiyor; akışı dışarıdan vermek belgelenmiş yol.)
 *
 * TEK interface, iki soru: readline girdiyi İLERİ OKUR; her soru için ayrı interface açmak
 * ikinci sorunun cevabını birincinin yutmasına yol açar.
 */
async function readInteractive(): Promise<string> {
  let muted = false;
  const masked = new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });

  const rl = createInterface({ input: process.stdin, output: masked, terminal: true });

  const ask = (question: string): Promise<string> =>
    new Promise((resolve, reject) => {
      // Girdi beklenmedik şekilde biterse cevap hiç gelmez; sessizce çıkmak yerine söyle.
      const onClose = () => reject(new Error('Girdi beklenmedik şekilde kapandı.'));
      rl.once('close', onClose);
      rl.question(question, (answer) => {
        rl.off('close', onClose);
        muted = false;
        process.stdout.write('\n');
        resolve(answer);
      });
      // Soru metni yazıldıktan SONRA sustur — yoksa soru da görünmez.
      muted = true;
    });

  try {
    const password = await ask('Panel parolası: ');
    // Doğrulama sorusu YALNIZCA burada var: parola görünmediği için yazım hatası fark
    // edilmez ve yanlış hash'le kilitlenmek bir deploy turu harcatır.
    const again = await ask('Parolayı tekrar girin: ');
    if (again !== password) throw new Error('Parolalar eşleşmedi. Hiçbir şey üretilmedi.');
    return password;
  } finally {
    rl.close();
  }
}

/**
 * Boru/yönlendirme ile çağrıldığında (CI, `printf ... | npm run auth:hash`) ilk satırı okur.
 * Burada readline KULLANILMAZ: terminal olmayan girdide readline satırları ileri okuyup
 * ikinci soruyu EOF'a düşürür. Tekrar sorusu da yok — script çağıran zaten parolayı biliyor.
 */
async function readPiped(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0];
}

async function main(): Promise<void> {
  const password = process.stdin.isTTY ? await readInteractive() : await readPiped();

  if (password.length < MIN_LENGTH) {
    console.error(`Parola en az ${MIN_LENGTH} karakter olmalı. Hiçbir şey üretilmedi.`);
    process.exit(1);
  }

  const hash = await hashPassword(password, randomBytes(16));
  const secret = randomBytes(32).toString('hex');

  console.log('\n── .env dosyanıza (ve DO panelinde SECRET olarak) ekleyin ──\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log('\n── AUTH_SECRET zaten varsa AŞAĞIDAKİNİ KULLANMAYIN: değiştirmek');
  console.log('   açık tüm oturumları düşürür (yeniden giriş gerekir). ──\n');
  console.log(`AUTH_SECRET=${secret}\n`);
}

main().catch((e) => {
  console.error('Hata:', e instanceof Error ? e.message : e);
  process.exit(1);
});
