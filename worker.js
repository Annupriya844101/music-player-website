const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
function trackFromMessage(message, env) {
  if (!message || String(message.chat?.id) !== String(env.TELEGRAM_CHAT_ID || "")) return null;
  const file = message.audio || (message.document && /^audio\//i.test(message.document.mime_type || "") ? message.document : null);
  if (!file?.file_id) return null;
  const size = Number(file.file_size || 0);
  if (size > 20 * 1024 * 1024) return null;
  const title = file.title || file.file_name || (message.caption || "").trim() || "Untitled track";
  return {
    id: String(message.message_id),
    title: String(title).replace(/\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i, "").slice(0, 250),
    artist: String(file.performer || "Telegram Library").slice(0, 160),
    duration: Number(file.duration || 0),
    fileId: file.file_id,
    size,
    mime: file.mime_type || "audio/mpeg"
  };
}
async function library(env) {
  const id = env.LIBRARY.idFromName("soundspace-main-library");
  return env.LIBRARY.get(id);
}
async function telegramCall(env, method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
  });
  const data = await r.json();
  if (!r.ok || !data.ok) throw new Error(data.description || `Telegram API ${method} failed`);
  return data.result;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return json({ ok: true, telegramConfigured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID), storage: "durable-object" });
    }
    if (url.pathname === "/telegram-webhook" && request.method === "POST") {
      if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
      let update;
      try { update = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
      const message = update.message || update.channel_post;
      const track = trackFromMessage(message, env);
      if (track) {
        const store = await library(env);
        await store.fetch("https://library/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(track) });
      }
      return new Response("ok");
    }
    if (url.pathname === "/api/tracks" && request.method === "GET") {
      const store = await library(env);
      const r = await store.fetch("https://library/tracks");
      const data = await r.json();
      return json({ tracks: data.tracks || [] });
    }
    if (url.pathname === "/api/admin/sync" && request.method === "POST") {
      if (!env.ADMIN_PASSWORD || request.headers.get("x-admin-password") !== env.ADMIN_PASSWORD) {
        return json({ error: "Incorrect admin password." }, 401);
      }
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID || !env.TELEGRAM_WEBHOOK_SECRET) {
        return json({ error: "Set TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID and TELEGRAM_WEBHOOK_SECRET in Cloudflare settings first." }, 503);
      }
      try {
        const result = await telegramCall(env, "setWebhook", {
          url: `${url.origin}/telegram-webhook`,
          secret_token: env.TELEGRAM_WEBHOOK_SECRET,
          allowed_updates: ["message", "channel_post"],
          drop_pending_updates: false
        });
        return json({ message: "Telegram webhook connected. Re-send your audio tracks in the private group; new tracks will appear automatically.", webhookSet: Boolean(result) });
      } catch (e) {
        return json({ error: "Could not connect Telegram webhook: " + e.message }, 502);
      }
    }
    const streamMatch = url.pathname.match(/^\/api\/stream\/([A-Za-z0-9_-]+)$/);
    if (streamMatch && request.method === "GET") {
      if (!env.TELEGRAM_BOT_TOKEN) return new Response("Telegram is not configured.", { status: 503 });
      const store = await library(env);
      const found = await store.fetch("https://library/track/" + encodeURIComponent(streamMatch[1]));
      if (!found.ok) return new Response("Track not found. Re-send the audio to your Telegram group.", { status: 404 });
      const track = await found.json();
      try {
        const file = await telegramCall(env, "getFile", { file_id: track.fileId });
        const upstream = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
        if (!upstream.ok || !upstream.body) return new Response("Audio stream unavailable.", { status: 502 });
        const headers = new Headers({
          "content-type": track.mime || "audio/mpeg",
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff"
        });
        if (track.size) headers.set("content-length", String(track.size));
        return new Response(upstream.body, { status: 200, headers });
      } catch {
        return new Response("Audio stream failed.", { status: 502 });
      }
    }
    return env.ASSETS.fetch(request);
  }
};
export class TrackLibrary {
  constructor(ctx) {
    this.ctx = ctx;
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 0, fileId TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0, mime TEXT NOT NULL DEFAULT 'audio/mpeg',
      addedAt INTEGER NOT NULL
    )`);
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/tracks" && request.method === "GET") {
      const rows = this.ctx.storage.sql.exec("SELECT id, title, artist, duration, size, mime, addedAt FROM tracks ORDER BY addedAt DESC").toArray();
      return Response.json({ tracks: rows });
    }
    if (url.pathname === "/track" && request.method === "POST") {
      const t = await request.json();
      this.ctx.storage.sql.exec(
        "INSERT INTO tracks (id,title,artist,duration,fileId,size,mime,addedAt) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,artist=excluded.artist,duration=excluded.duration,fileId=excluded.fileId,size=excluded.size,mime=excluded.mime",
        t.id, t.title, t.artist, t.duration, t.fileId, t.size, t.mime, Date.now()
      );
      return Response.json({ ok: true });
    }
    const match = url.pathname.match(/^\/track\/([A-Za-z0-9_-]+)$/);
    if (match && request.method === "GET") {
      const row = this.ctx.storage.sql.exec("SELECT id,title,artist,duration,fileId,size,mime FROM tracks WHERE id = ?", match[1]).toArray()[0];
      return row ? Response.json(row) : new Response("Not found", { status: 404 });
    }
    return new Response("Not found", { status: 404 });
  }
}