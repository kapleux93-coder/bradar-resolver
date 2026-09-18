'use strict';
/* ============================================================================
 * BRADAR contact resolver — MTProto userbot, always-on (Render).
 *
 *   GET /resolve?title=<channel title>&subs=<members>&token=<RESOLVER_TOKEN>
 *     → searches Telegram for the channel, matches by title + subscriber count,
 *       reads its description, and returns the real @username + advertising contact.
 *   GET /health → { ok, connected }
 *
 * Resolves ON DEMAND for any public channel — no pre-built database. BRADAR's Vercel
 * backend calls this (it can't hold a persistent MTProto socket on serverless).
 *
 * ENV: TG_API_ID, TG_API_HASH, TG_SESSION (from login.js), RESOLVER_TOKEN (shared secret
 *      so only BRADAR can call), PORT (Render sets it), plus optional CACHE_DAYS.
 * ========================================================================== */
const http = require('http');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { titleSim, subsSim, extractAdContact } = require('./lib');

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH || '';
const session = process.env.TG_SESSION || '';
const TOKEN = process.env.RESOLVER_TOKEN || '';
const PORT = Number(process.env.PORT) || 8091;
const ACCEPT = Number(process.env.RESOLVE_ACCEPT) || 0.5;
const OK_TTL = (Number(process.env.CACHE_DAYS) || 30) * 86400000;
const NEG_TTL = (Number(process.env.NEG_CACHE_DAYS) || 3) * 86400000;

let client = null, connecting = null;
async function getClient() {
  if (client && client.connected) return client;
  if (connecting) return connecting;
  connecting = (async () => {
    const c = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5, autoReconnect: true });
    await c.connect();
    client = c; connecting = null; return c;
  })();
  return connecting;
}

// serialize MTProto calls + small gap → stay well under Telegram's flood limits.
let chain = Promise.resolve();
const GAP = Number(process.env.RESOLVE_GAP_MS) || 700;
function queue(fn) { const run = chain.then(fn, fn); chain = run.then(() => sleep(GAP), () => sleep(GAP)); return run; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cache = new Map();   // normKey → { val, exp }
const keyOf = (title, subs) => String(title).toLowerCase().slice(0, 50) + '|' + Math.round((Number(subs) || 0) / 10000);

async function resolveChannel(title, subs) {
  const key = keyOf(title, subs);
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;

  const val = await queue(async () => {
    const cl = await getClient();
    let res;
    try { res = await cl.invoke(new Api.contacts.Search({ q: String(title).slice(0, 64), limit: 10 })); }
    catch (e) {
      const wait = e && e.seconds ? e.seconds : 0;                       // FLOOD_WAIT_x
      if (wait && wait <= 30) { await sleep((wait + 1) * 1000); res = await cl.invoke(new Api.contacts.Search({ q: String(title).slice(0, 64), limit: 10 })); }
      else throw e;
    }
    const chans = (res.chats || []).filter(ch => ch.className === 'Channel' && ch.username && ch.broadcast);
    let best = null, bestScore = -1;
    for (const ch of chans) {
      const ts = titleSim(title, ch.title || '');
      const cnt = Number(ch.participantsCount) || 0;
      const ss = (subs > 0 && cnt > 0) ? subsSim(subs, cnt) : 0;
      const score = (subs > 0 && cnt > 0) ? (0.55 * ts + 0.45 * ss) : ts;
      if (score > bestScore) { bestScore = score; best = ch; }
    }
    if (!best || bestScore < ACCEPT) return null;
    let about = '';
    try {
      const full = await cl.invoke(new Api.channels.GetFullChannel({ channel: best }));
      about = (full && full.fullChat && full.fullChat.about) || '';
    } catch (e) { /* description optional */ }
    return {
      username: best.username,
      link: 'https://t.me/' + best.username,
      subs: Number(best.participantsCount) || 0,
      adContact: extractAdContact(about, best.username),
      confidence: Math.round(bestScore * 100) / 100,
    };
  });

  cache.set(key, { val, exp: Date.now() + (val ? OK_TTL : NEG_TTL) });
  return val;
}

function send(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/health') return send(res, 200, { ok: true, connected: !!(client && client.connected), cache: cache.size });
  if (u.pathname === '/resolve') {
    if (TOKEN && u.searchParams.get('token') !== TOKEN) return send(res, 401, { error: 'auth' });
    const title = (u.searchParams.get('title') || '').trim();
    const subs = Number(u.searchParams.get('subs')) || 0;
    if (title.length < 3) return send(res, 200, { resolved: false });
    try {
      const r = await resolveChannel(title, subs);
      return send(res, 200, r ? Object.assign({ resolved: true }, r) : { resolved: false });
    } catch (e) { return send(res, 200, { resolved: false, error: String((e && e.message) || e).slice(0, 160) }); }
  }
  send(res, 404, { error: 'not found' });
}).listen(PORT, () => {
  console.log('bradar-resolver on :' + PORT);
  if (!apiId || !apiHash || !session) console.warn('⚠ missing TG_API_ID / TG_API_HASH / TG_SESSION — /resolve will fail until set');
  else getClient().then(() => console.log('MTProto connected')).catch(e => console.error('connect failed:', e && e.message));
});
