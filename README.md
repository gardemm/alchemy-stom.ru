# alhimiya-stom.ru

Одностраничный сайт агентства «Алхимия маркетинга» с Node.js-бэкендом для приёма заявок и pre-flight анализа ссылок.

## Стек

- HTML + Tailwind CSS (CDN) + ванильный JS — фронт
- Node.js + Express — бэкенд (без БД, лиды пишутся в `leads.jsonl`)
- Опциональная интеграция с Telegram-ботом для уведомлений о заявках

## Запуск локально

```bash
npm install
npm start
# открыть http://localhost:3000
```

## Переменные окружения (необязательно)

```bash
PORT=3000
TELEGRAM_BOT_TOKEN=123456:AA...     # токен бота
TELEGRAM_CHAT_ID=123456789           # узнать через @userinfobot
```

Если заданы — каждая заявка приходит вам в Telegram моментально.

## Деплой

Подойдёт любой хостинг с Node.js (Beget VPS, REG.RU Cloud, Selectel, Timeweb).
Минимум: установить `Node 18+`, склонировать репозиторий, `npm install`, поставить под systemd / pm2, проксировать через nginx с SSL (letsencrypt).

Пример unit-файла systemd:

```ini
[Unit]
Description=alhimiya-stom
After=network.target

[Service]
WorkingDirectory=/var/www/alhimiya-stom
ExecStart=/usr/bin/node server.js
Environment=PORT=3000
Environment=TELEGRAM_BOT_TOKEN=xxx
Environment=TELEGRAM_CHAT_ID=xxx
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

## Структура

```
public/         — статика, отдаётся напрямую
  index.html    — лендинг
  styles.css    — кастомные стили
  main.js       — формы, реveal-анимации, плавный скролл
server.js       — Express + /api/analyze
leads.jsonl     — append-only журнал заявок (создаётся автоматически)
package.json
NOTES.md        — рекомендации по усилению конверсии
```

## Что отдаёт `/api/analyze`

Принимает JSON:

```json
{
  "url": "https://yandex.ru/maps/org/...",
  "name": "Иван",
  "clinic": "Стомцентр",
  "channel": "telegram",
  "contact": "@ivan"
}
```

Возвращает:

```json
{
  "ok": true,
  "id": "A1B2C3D4",
  "preview": {
    "domain": "Яндекс Карты",
    "type": "Геосервис",
    "note": "Проверим карточку, рубрики, фото, отзывы..."
  }
}
```

Базовый анализ определяет площадку по домену, тянет `<title>` (best-effort, 5 сек),
сохраняет заявку и пингует владельца в Telegram. Этого достаточно, чтобы дать
человеку «магическое» ощущение мгновенной обратной связи, а полный аудит
сделать вручную в течение дня.
