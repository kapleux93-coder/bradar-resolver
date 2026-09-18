'use strict';
/* Pure helpers for matching a Telemetr channel (title + subs) to a Telegram search result,
 * and pulling the advertising contact out of a channel's description / pinned text.
 * No deps → unit-testable in isolation. */

const NORM_STOP = new Set(['канал', 'news', 'новости', 'онлайн', 'online', 'телеграм', 'telegram', 'чат', 'chat', 'group', 'групп', 'группа', 'live', 'official']);
function normTitle(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/[^a-zа-я0-9 ]+/g, ' ')
    .split(/\s+/).filter(w => w && !NORM_STOP.has(w) && !/^официальн/.test(w))
    .join(' ').trim();
}
// token-overlap similarity of two titles, 0..1
function titleSim(a, b) {
  const A = new Set(normTitle(a).split(' ').filter(Boolean));
  const B = new Set(normTitle(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(w => { if (B.has(w)) inter++; });
  return inter / Math.max(A.size, B.size);
}
// subscriber-count closeness, 0..1 (Telemetr vs Telegram may differ a bit → tolerant)
function subsSim(a, b) {
  a = Number(a) || 0; b = Number(b) || 0;
  if (a <= 0 || b <= 0) return 0;
  return Math.max(0, 1 - Math.abs(a - b) / Math.max(a, b));
}
// advertising contact from description + pinned: a @username / t.me / email, preferring one sitting
// next to an "ad" keyword and never the channel's own handle.
const AD_KW = /(реклам|сотруднич|по\s*вопрос|по\s*размещ|менеджер|\bадмин|размещен|прайс|\bpr\b|\bads?\b|commercial|marketing|бронир|для\s*связи|связаться|contact|по\s*рекл)/i;
function extractAdContact(text, ownUsername) {
  if (!text) return '';
  const own = String(ownUsername || '').replace(/^@/, '').toLowerCase();
  const re = /(@[a-zA-Z0-9_]{4,32})|(?:t\.me\/)([a-zA-Z0-9_]{4,32})|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const found = []; let m;
  while ((m = re.exec(text))) {
    const val = m[1] || (m[2] ? '@' + m[2] : null) || m[3];
    if (!val) continue;
    const bare = val.replace(/^@/, '').toLowerCase();
    if (bare === own && val.indexOf('@') === 0) continue;   // skip the channel's own handle (keep emails)
    const near = AD_KW.test(text.slice(Math.max(0, m.index - 50), m.index)) || AD_KW.test(text.slice(m.index, m.index + 40));
    found.push({ val, near });
  }
  if (!found.length) return '';
  return (found.find(f => f.near) || found[0]).val;
}

module.exports = { normTitle, titleSim, subsSim, extractAdContact };
