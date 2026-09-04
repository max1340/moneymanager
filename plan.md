# Financy PRO — Plan v2.0

## Статус: 🚧 В разработке

## Цель
Перенести Financy PRO на Firebase RTDB + Netlify PWA с мобильной адаптацией.

## Выполнено
- [x] package.json (Vite + Firebase)
- [x] vite.config.js
- [x] netlify.toml
- [x] .gitignore
- [x] src/js/firebase-db.js (Firebase RTDB вместо File System API)
- [x] src/js/main.js (точка входа Vite)
- [x] src/js/app.js (переписан под Firebase)
- [x] src/js/crud.js (импорт обновлён)
- [x] index.html (мобильный UI, убраны file-buttons)
- [x] src/css/styles.css (мобильная адаптация)
- [x] src/manifest.json (обновлён)
- [x] public/sw.js (Vite-compatible service worker)

## В процессе
- [/] npm install + npm run build (тест сборки)

## Осталось
- [ ] Firebase Rules — добавить правила для ветки financy/
- [ ] Netlify deploy
- [ ] Тест на мобильном

## Архитектура данных Firebase

```
financy/
  data/
    _json: "{...state JSON...}"
    _updated: 1234567890
```

Все данные хранятся как JSON-строка в поле `_json`.
Существующие ветки (backups, builds, components, crm, kadr_website, users) не затронуты.

## Firebase Rules (нужно добавить в Firebase Console)

```json
{
  "rules": {
    "financy": {
      ".read": true,
      ".write": true
    }
  }
}
```

⚠️ Все остальные правила для других веток должны остаться без изменений!

## Netlify Deploy

1. Push проект на GitHub
2. Подключить репозиторий в Netlify
3. Build command: `npm install && npm run build`
4. Publish directory: `dist`

## Перенос старых данных

В приложении → кнопка "📥 Импорт" → выбрать `financy_db.json` с ПК
