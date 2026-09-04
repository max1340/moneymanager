# Financy PRO — Plan v2.0

## Статус: 🚀 Задеплоено в GitHub (ожидает подключения к Netlify)

## Цель
Перенести Financy PRO на Firebase RTDB + Netlify PWA с мобильной адаптацией.

## Выполнено
- [x] package.json (Vite + Firebase)
- [x] vite.config.js
- [x] netlify.toml
- [x] .gitignore (с исключением персональных данных)
- [x] src/js/firebase-db.js (Firebase RTDB вместо File System API)
- [x] src/js/main.js (точка входа Vite)
- [x] src/js/app.js (переписан под Firebase и адаптивный мобильный интерфейс)
- [x] src/js/crud.js (импорт обновлён)
- [x] index.html (мобильный nav, карточки операций, PWA мета-теги)
- [x] src/css/styles.css (мобильная адаптация: карточки, bottom sheets, 48px touch targets, iOS zoom prevention)
- [x] src/manifest.json (PWA манифест)
- [x] public/sw.js (Vite-совместимый service worker)
- [x] npm install + npm run build (сборка протестирована и проходит без ошибок)
- [x] Инициализация Git-репозитория и отправка в https://github.com/max1340/moneymanager.git (ветка `main`)

## Осталось выполнить
- [ ] Firebase Rules — добавить правило доступа для ветки `financy/` в Firebase Console
- [ ] Netlify — нажать «Import from Git» и выбрать репозиторий `max1340/moneymanager`
- [ ] Перенос данных со старой версии (кнопка «📥 Импорт» в приложении)

## Архитектура данных Firebase

```
financy/
  data/
    _json: "{...state JSON...}"
    _updated: 1234567890
```

Все данные хранятся как JSON-строка в поле `_json`.
Существующие ветки (`backups`, `builds`, `components`, `crm`, `kadr_website`, `users`) не затрагиваются.

## Firebase Rules (добавить в Firebase Console)

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

## Netlify Deploy

1. Репозиторий уже запушен: `https://github.com/max1340/moneymanager.git`
2. В Netlify: **Add new site** -> **Import an existing project** -> **GitHub** -> `max1340/moneymanager`
3. Настройки сборки определятся автоматически из `netlify.toml`:
   - Build command: `npm install && npm run build`
   - Publish directory: `dist`
