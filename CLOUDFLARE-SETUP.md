# SoundSpace — Cloudflare free deployment

Cloudflare Workers avoids the long idle spin-down used by many free Node hosts. This deployment uses Workers static assets and a SQLite-backed Durable Object to retain the track index across restarts. The audio itself stays in your private Telegram group.

## One-time setup
1. Create/sign in to a Cloudflare account at https://dash.cloudflare.com/ and open Workers & Pages.
2. In account settings, create an API token with permission to edit Workers and access the account. Copy it only into GitHub Actions secrets; never paste it into chat or commit it.
3. In this GitHub repo open Settings → Secrets and variables → Actions. Add secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. Go to Actions → Deploy SoundSpace to Cloudflare Workers → Run workflow (or push a change after adding the secrets). The first deploy creates the Durable Object storage class automatically.
5. In Cloudflare Worker → Settings → Variables and Secrets, add:
   - `TELEGRAM_BOT_TOKEN` = your BotFather token
   - `TELEGRAM_CHAT_ID` = your private group chat ID (often starts with `-100`)
   - `TELEGRAM_WEBHOOK_SECRET` = a long random string containing only letters, digits, underscores or hyphens
   - `ADMIN_PASSWORD` = a strong unique password
   Save and redeploy.
6. Open your deployed URL plus `/admin.html`. Enter the admin password and click Sync to connect Telegram's webhook. Re-send your test audio and other tracks to the group; each new message is stored automatically.
7. Open the player home page and test playback, search, shuffle and repeat.

## Notes
- Do not add these secrets to GitHub source files. GitHub repository visibility does not expose Actions secret values.
- Standard Telegram Bot API file downloads are limited to 20 MB per file. Larger files require a different Telegram Bot API setup or storage.
- Telegram's Bot API does not offer a general endpoint to enumerate arbitrary old group history. After webhook setup, re-send the songs you want indexed.
- Free Cloudflare Workers have usage limits. Monitor account usage; no paid upgrade is required for this setup, and do not enable paid billing unless you choose to.
- The legacy Node server remains available for local development, but Cloudflare deployment uses `worker.js`.
