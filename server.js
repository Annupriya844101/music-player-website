require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const { Readable } = require('node:stream');
const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(express.json({ limit: '32kb' }));
app.use(express.static('public', { extensions: ['html'] }));

const PORT = Number(process.env.PORT || 3000);
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const MAX_MB = Math.min(20, Math.max(1, Number(process.env.MAX_UPLOAD_MB || 20)));
const tracks = new Map();
let offset = 0;
let polling = false;
let lastPollError = null;
const telegram = (method, params = {}) => fetch('https://api.telegram.org/bot' + TOKEN + '/' + method, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params)
});
function audioFromMessage(m) {
  if (!m || String(m.chat && m.chat.id) !== CHAT_ID) return null;
  const item = m.audio || (m.document && /^audio\//i.test(m.document.mime_type || '') ? m.document : null);
  if (!item || !item.file_id || (item.file_size && item.file_size > MAX_MB * 1024 * 1024)) return null;
  const title = item.title || item.file_name || (m.caption || '').trim() || 'Untitled track';
  const id = String(m.message_id);
  return { id, title: title.replace(/\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i, ''), artist: item.performer || 'Telegram Library',
    duration: Number(item.duration || 0), fileId: item.file_id, size: Number(item.file_size || 0), mime: item.mime_type || 'audio/mpeg' };
}
async function pollTelegram() {
  if (!TOKEN || !CHAT_ID || polling) return { added: 0, skipped: true };
  polling = true;
  let added = 0;
  try {
    const res = await telegram('getUpdates', { offset, timeout: 0, allowed_updates: ['message', 'channel_post'] });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error((data && data.description) || 'Telegram API error');
    for (const update of data.result || []) {
      offset = Math.max(offset, update.update_id + 1);
      const m = update.message || update.channel_post;
      const t = audioFromMessage(m);
      if (t && !tracks.has(t.id)) { tracks.set(t.id, t); added++; }
    }
    lastPollError = null;
    return { added, total: tracks.size };
  } catch (e) { lastPollError = e.message; throw e; }
  finally { polling = false; }
}
app.get('/api/health', (_req, res) => res.json({ ok: true, telegramConfigured: Boolean(TOKEN && CHAT_ID), tracks: tracks.size, lastPollError }));
app.get('/api/tracks', (_req, res) => res.json({ tracks: [...tracks.values()].map(({fileId, ...t}) => t) }));
app.post('/api/admin/sync', async (req, res) => {
  if (!ADMIN_PASSWORD || req.get('x-admin-password') !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Incorrect admin password.' });
  try {
    const result = await pollTelegram();
    res.json({ message: result.skipped ? 'Set Telegram environment variables first.' : `Sync complete. ${result.added} new track(s); ${tracks.size} total.`, ...result });
  } catch (e) { res.status(502).json({ error: 'Telegram sync failed: ' + e.message }); }
});
app.get('/api/stream/:id', async (req, res) => {
  const t = tracks.get(String(req.params.id));
  if (!t) return res.status(404).send('Track not found. Re-send the audio to your Telegram group and sync.');
  try {
    const f = await telegram('getFile', { file_id: t.fileId });
    const fd = await f.json();
    if (!f.ok || !fd.ok || !fd.result.file_path) return res.status(502).send('Could not locate audio file.');
    const upstream = await fetch('https://api.telegram.org/file/bot' + TOKEN + '/' + fd.result.file_path);
    if (!upstream.ok || !upstream.body) return res.status(502).send('Audio stream unavailable.');
    res.setHeader('Content-Type', t.mime || 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Cache-Control', 'private, max-age=60');
    if (t.size) res.setHeader('Content-Length', String(t.size));
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (e) { if (!res.headersSent) res.status(502).send('Audio stream failed.'); }
});
app.listen(PORT, () => {
  console.log('SoundSpace listening on port ' + PORT);
  if (process.env.TELEGRAM_POLLING !== 'false' && TOKEN && CHAT_ID) {
    pollTelegram().catch(() => {});
    setInterval(() => pollTelegram().catch(() => {}), 5000);
  }
});