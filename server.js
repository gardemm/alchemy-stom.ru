/**
 * Алхимия маркетинга — backend
 *
 * Минимальный Node.js / Express сервер:
 *   • отдаёт /public как статику
 *   • POST /api/analyze — принимает заявку, делает базовый pre-flight анализ
 *     ссылки (определяет площадку, тянет <title>/<meta>),
 *     сохраняет лид в leads.jsonl и шлёт уведомление в Telegram, если задан токен.
 *
 * Запуск:
 *   npm install
 *   npm start            # http://localhost:3000
 *
 * ENV (необязательно):
 *   PORT                       — порт (по умолчанию 3000)
 *   TELEGRAM_BOT_TOKEN         — токен бота для уведомлений о новых заявках
 *   TELEGRAM_CHAT_ID           — чат-id владельца (узнаётся через @userinfobot)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  setHeaders(res, p) {
    if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

// --- security headers ---
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// --- simple in-memory rate limit (per IP) ---
const RATE = new Map();
function rateLimit(ip, max = 6, windowMs = 60_000) {
  const now = Date.now();
  const entry = RATE.get(ip) || { count: 0, ts: now };
  if (now - entry.ts > windowMs) { entry.count = 0; entry.ts = now; }
  entry.count++;
  RATE.set(ip, entry);
  return entry.count <= max;
}

// --- platform detection ---
const PLATFORMS = [
  { match: /yandex\.[a-z.]+\/maps/i,   name: 'Яндекс Карты',     type: 'geo'        },
  { match: /yandex\.[a-z.]+\/business/i, name: 'Яндекс Бизнес',  type: 'geo'        },
  { match: /2gis\.[a-z]+/i,             name: '2ГИС',            type: 'geo'        },
  { match: /prodoctorov\.ru/i,          name: 'ПроДокторов',     type: 'aggregator' },
  { match: /sberzdorovie\.ru|sberhealth/i, name: 'СберЗдоровье', type: 'aggregator' },
  { match: /napopravku\.ru/i,           name: 'НаПоправку',      type: 'aggregator' },
  { match: /docdoc\.ru/i,               name: 'DocDoc',          type: 'aggregator' },
  { match: /zoon\.ru/i,                 name: 'Zoon',            type: 'aggregator' },
  { match: /flamp\.ru/i,                name: 'Flamp',           type: 'reviews'    },
  { match: /yell\.ru/i,                 name: 'Yell',            type: 'reviews'    },
];

function detectPlatform(url) {
  try {
    const u = new URL(url);
    for (const p of PLATFORMS) if (p.match.test(u.hostname + u.pathname)) return p;
    return { name: u.hostname.replace(/^www\./, ''), type: 'site' };
  } catch {
    return null;
  }
}

// --- fetch <title> + description (best-effort, 5s timeout) ---
async function previewLink(url) {
  const platform = detectPlatform(url);
  if (!platform) return { ok: false, reason: 'bad-url' };

  const result = {
    domain: platform.name,
    type: platform.type === 'geo'        ? 'Геосервис'
        : platform.type === 'aggregator' ? 'Медицинский агрегатор'
        : platform.type === 'reviews'    ? 'Отзовик'
        :                                  'Сайт клиники',
    note: defaultNote(platform.type),
  };

  // Try to fetch <title>; if blocked / slow — silently fall back.
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 AlhimiyaBot/1.0' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    clearTimeout(t);
    const html = (await r.text()).slice(0, 60_000);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (title && title[1].trim()) {
      result.note = title[1].trim().replace(/\s+/g, ' ').slice(0, 110);
    }
  } catch { /* ignore */ }

  return { ok: true, ...result };
}

function defaultNote(t) {
  return t === 'geo'        ? 'Проверим карточку, рубрики, фото, отзывы и позицию.'
       : t === 'aggregator' ? 'Проверим страницу клиники, врачей, цены, рейтинг.'
       : t === 'reviews'    ? 'Соберём картину репутации и негатива.'
       :                      'Посмотрим SEO, тексты и конверсию посадочной.';
}

// --- Telegram notifier (optional) ---
async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat  = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch (e) {
    console.error('[telegram] notify failed:', e.message);
  }
}

// --- write lead to disk ---
const LEADS_FILE = path.join(__dirname, 'data', 'leads.jsonl');
function saveLead(lead) {
  fs.appendFileSync(LEADS_FILE, JSON.stringify(lead) + '\n', 'utf8');
}

// --- validators ---
function validURL(s) {
  try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol);
  } catch { return false; }
}

// === POST /api/analyze ===
app.post('/api/analyze', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  if (!rateLimit(ip)) return res.status(429).json({ ok: false, error: 'Too many requests' });

  const { url, name, clinic, channel, contact } = req.body || {};
  if (!validURL(url || ''))       return res.status(400).json({ ok: false, error: 'Некорректная ссылка' });
  if (!name || name.length > 80)  return res.status(400).json({ ok: false, error: 'Имя обязательно' });
  if (!contact || contact.length > 80) return res.status(400).json({ ok: false, error: 'Контакт обязателен' });
  if (!['telegram', 'max', 'phone'].includes(channel || '')) {
    return res.status(400).json({ ok: false, error: 'Неверный канал связи' });
  }

  const id = crypto.randomBytes(4).toString('hex').toUpperCase();
  const preview = await previewLink(url);

  const lead = {
    id,
    at: new Date().toISOString(),
    ip,
    url, name, clinic: clinic || '', channel, contact,
    preview,
    ua: req.headers['user-agent'] || '',
  };

  try { saveLead(lead); } catch (e) { console.error('[lead] save failed:', e.message); }

  // Notify owner via Telegram if configured
  const text =
    `<b>Новая заявка</b> #${id}\n` +
    `<b>${escapeHTML(name)}</b>${clinic ? ' · ' + escapeHTML(clinic) : ''}\n` +
    `Канал: ${channel} · <code>${escapeHTML(contact)}</code>\n\n` +
    `Ссылка: <a href="${escapeHTML(url)}">${escapeHTML(url)}</a>\n` +
    `Площадка: ${escapeHTML(preview.domain || '—')} (${escapeHTML(preview.type || '—')})\n` +
    (preview.note ? `\n<i>${escapeHTML(preview.note)}</i>` : '');
  notifyTelegram(text);

  res.json({ ok: true, id, preview });
});

function escapeHTML(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

// --- SPA-style fallback to index.html for any unknown GET ---
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[alhimiya-stom] listening on http://localhost:${PORT}`);
});
