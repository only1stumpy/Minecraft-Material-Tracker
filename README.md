# Antville

Веб-сервис для учёта построек и материалов на Minecraft-сервере. Antville хранит каталог построек с привязкой к координатам мира, прикреплённой схемой [Litematica](https://www.curseforge.com/minecraft/mc-mods/litematica) и автоматически сгенерированным чек-листом материалов — со стаками, шалкерами и отметкой, кто из игроков что добыл.

## Возможности

- **Каталог построек** — список всех зданий с координатами и количеством блоков.
- **Карточка постройки** — название, координаты привязки (X, Y, Z), скриншот, файл схемы (`.litematic`) и файл материалов.
- **Парсинг материалов** — таблица материалов из лога/текстового файла (формат вывода Litematica) автоматически разбирается на позиции: предмет, всего, не хватает, есть в наличии.
- **Чек-лист сборки** — для каждой позиции материалов: отметка «собрано», пересчёт количества в стаки и шалкер-боксы, поле «кто добыл».
- **Автосохранение прогресса** — изменения в чек-листе сохраняются на сервер через debounce (1 сек) без явного нажатия кнопки.
- **Хранилище скриншотов** — превью постройки сохраняется как data URL прямо в базе.

## Стек технологий

- [Next.js 16](https://nextjs.org/) (App Router, Server Components)
- [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Prisma ORM](https://www.prisma.io/) + PostgreSQL
- Деплой: [Vercel](https://vercel.com/)

## Структура проекта

```
app/
  page.tsx                     # каталог построек
  buildings/new/page.tsx       # форма создания постройки
  buildings/[id]/page.tsx      # карточка постройки
  buildings/[id]/BuildingChecklist.tsx  # интерактивный чек-лист материалов
  api/buildings/route.ts       # POST/GET построек
  api/buildings/[id]/checklist # PATCH прогресса чек-листа
lib/
  materials.ts                 # парсинг таблицы материалов, конвертация в стаки/шалкеры
  buildings.ts                 # вспомогательные типы/in-memory store
  prisma.ts                    # инициализация Prisma Client
prisma/
  schema.prisma                # модель Buildings
```

## Модель данных

```prisma
model Buildings {
  id                String   @id @default(cuid())
  name              String
  x                 Int
  y                 Int
  z                 Int
  schematicFileName String
  materialsFileName String
  screenshotDataUrl String?
  materials         Json     // исходный список материалов (статичный)
  checklist         Json     @default("[]") // прогресс сборки (динамичный)
  createdAt         DateTime @default(now())
}
```

## Формат входного файла материалов

Поддерживается табличный текстовый формат (как в выводе мода Litematica):

```
+----------------------------------------------+-------+---------+-----------+
| Item                                         | Total | Missing | Available |
+----------------------------------------------+-------+---------+-----------+
| Кирпичи                                      |  4974 |    4974 |         0 |
| Каменные кирпичи                             |  3200 |     396 |         0 |
| Дёрн                                         |  2462 |     244 |         0 |
+----------------------------------------------+-------+---------+-----------+
```

## Запуск проекта

### 1. Установка зависимостей

```bash
npm install
```

### 2. Переменные окружения

Создайте `.env` в корне проекта:

```
DATABASE_URL="postgresql://user:password@host:5432/dbname"
```

### 3. Применение миграций

```bash
npx prisma migrate deploy
```

### 4. Запуск дев-сервера

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

## Деплой

Проект готов к деплою на [Vercel](https://vercel.com/new) — достаточно подключить репозиторий и указать `DATABASE_URL` в переменных окружения.

Демо: [antville.vercel.app](https://antville.vercel.app)
