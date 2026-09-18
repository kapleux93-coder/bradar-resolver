'use strict';
/* One-time login → prints a StringSession you paste into TG_SESSION on the resolver host.
 * Run LOCALLY:  TG_API_ID=... TG_API_HASH=... node login.js
 * You enter the phone, the code Telegram sends, and (if set) your 2FA password. Nothing leaves
 * your machine except the session string it prints — keep that secret (it = full account access). */
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, (a) => r((a || '').trim())));

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;

(async () => {
  if (!apiId || !apiHash) {
    console.error('\n❌ Сначала задай ключи:  TG_API_ID=123456 TG_API_HASH=abc... node login.js\n');
    process.exit(1);
  }
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 });
  await client.start({
    phoneNumber: () => ask('Телефон юзербота (в формате +7XXXXXXXXXX): '),
    phoneCode: () => ask('Код из Telegram: '),
    password: () => ask('Пароль 2FA (если включён; иначе просто Enter): '),
    onError: (e) => console.error('Ошибка входа:', e && e.message ? e.message : e),
  });
  const s = client.session.save();
  console.log('\n============================================================');
  console.log('✅ ГОТОВО. Это твоя TG_SESSION (СЕКРЕТ — только в env, не в чат):\n');
  console.log(s);
  console.log('\nПоложи её в переменную TG_SESSION на Render (вместе с TG_API_ID / TG_API_HASH).');
  console.log('============================================================\n');
  await client.disconnect();
  process.exit(0);
})();
