# Chatkeeper Frontend

Веб-панель для просмотра сохранённых переписок. Стек: **Vite + React 18 + Tailwind
CSS + lucide-react** (по образцу `secure-ask-admin`).

## Команды

```bash
npm install        # поставить зависимости (один раз)
npm run dev        # режим разработки на http://localhost:5173
npm run build      # сборка статики в dist/
npm run preview    # локальный просмотр собранной версии
```

В режиме `dev` запросы к `/api/*` проксируются на Go-бэкенд
(`http://localhost:8080`) — настроено в [vite.config.js](vite.config.js).

## Как это работает

- Вход по логину/паролю (`src/components/LoginPage.jsx`) → сервер выдаёт JWT,
  который хранится в `localStorage` и шлётся в заголовке `Authorization: Bearer`.
- Главный экран — двухколоночный мессенджер: список чатов
  (`ChatList`) + лента сообщений (`ChatView` / `MessageBubble`).
- Удалённые сообщения подсвечены красным и зачёркнуты, отредактированные помечены
  ✏️ с историей «было → стало» (`EditHistory`).
- Вкладка «Обзор» — карточки статистики.

Весь обмен с сервером — в [src/api.js](src/api.js).

## Нужен бэкенд

Панель работает поверх REST API бота (`/api/*`), реализованного **в Go-части
этого же проекта** (пакет `internal/transport/httpapi/`). Запусти бота
(`make run` из корня) — тогда панель получит данные. Без запущенного бэкенда
откроется только страница входа.

## Структура

```
src/
├── App.jsx                 вкладки: Переписки / Обзор, загрузка данных
├── api.js                  клиент REST API (login, chats, messages, media)
└── components/
    ├── LoginPage.jsx       страница авторизации
    ├── Navbar.jsx          верхняя панель
    ├── ChatList.jsx        список диалогов
    ├── ChatView.jsx        лента сообщений + пагинация
    ├── MessageBubble.jsx   один «пузырь» (текст/медиа/удалено/правка)
    ├── EditHistory.jsx     модалка истории правок
    └── StatCard.jsx        карточка метрики
```
