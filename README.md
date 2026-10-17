# SoundSpace Music Player

A responsive dark music player that streams audio stored in a Telegram private group through a Node.js backend.

## Features
- Telegram-backed track index and protected audio streaming
- Search, play/pause, seek, volume, shuffle, repeat-one/repeat-all
- Admin sync endpoint protected by a password
- GitHub Actions CI check

## Setup
1. Create a Telegram bot with BotFather and add it to your private group. Make sure the bot can read group messages.
2. Upload/re-send audio files to that group after the server starts; the standard Bot API does not provide arbitrary history search.
3. Set environment variables: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ADMIN_PASSWORD, SESSION_SECRET.
4. Run `npm install` and `npm start`.

Standard Telegram Bot API file downloads are limited to 20 MB. Keep secrets in the hosting provider's environment settings; never commit your .env file or bot token.

## Local run
```sh
npm install
cp .env.example .env
npm start
``
Open http://localhost:3000.
