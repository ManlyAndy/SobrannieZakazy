# SobrannieZakazy

Приложение для обработки собранных отгрузок МойСклад.

## Структура
- `worker.js` — Cloudflare Worker/API.
- `public/index.html` — интерфейс.
- `public/app.js` — клиентская логика.
- `public/config.js` — настройки приложения, включая список сборщиков.
- `public/manifest.json` — PWA manifest.
- `wrangler.toml` — конфигурация Cloudflare Worker + Static Assets.

## Перед первым тестом
1. В `public/config.js` заполнить `PICKER_NAMES` реальными именами сборщиков.
2. В Cloudflare Worker добавить Secrets:
   - `BITRIX_WEBHOOK_URL` — существующий входящий webhook Bitrix24.
3. Добавить секрет МойСклад, если проект будет переведён с Basic Auth на серверный токен. Текущая версия использует логин/пароль МойСклад от пользователя для API-вызовов.

## Cloudflare
- Worker name: `SobrannieZakazy`
- Deploy command: `npx wrangler deploy`
- Build command: пусто
- Root/path: `/`
- Static assets: `./public`

## Bitrix24
Загрузка фото выполняется методом `im.v2.File.upload` в чат `chat11359`. Метод требует scope `im` и доступ пользователя-владельца webhook к чату.
