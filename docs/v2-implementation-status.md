# Статус реализации Antville Builder 2.0

Карта сверяет требования из [`docs/antville-builder-2.0.md`](antville-builder-2.0.md) с текущим кодом и эксплуатационными документами. Статус `Реализовано в коде` означает, что соответствующие маршруты, компоненты, скрипты или модели найдены в репозитории; production-проверка указывается отдельно. `Частично` означает, что часть требования есть в исходниках, а часть явно указана в ограничениях. `Внешняя проверка` означает, что доказательство зависит от production, PostgreSQL, Vercel или реальных сетей игроков.

В этой карте разделены два вида доказательств: ссылки в таблице подтверждают наличие реализации в исходниках, а production-проверка засчитывается только после отдельного запуска с зафиксированным результатом. Обновлено 14 октября 2026 года после выпуска V2 в Vercel Production.

## Сводка по разделам ТЗ

| Раздел ТЗ | Статус | Доказательства в исходниках | Остаток и ограничение |
| --- | --- | --- | --- |
| 1. Авторизация и система аккаунтов | Реализовано в коде | [`lib/auth.ts`](../lib/auth.ts), [`app/api/admin/users/route.ts`](../app/api/admin/users/route.ts), [`app/profile/page.tsx`](../app/profile/page.tsx) | Production-вход `only1stumpy` проверен: временный пароль заменён через штатную форму, новый вход вернул `mustChangePassword=false`. `/admin` и `/moderation` вернули HTTP 200. Сценарий отдельной кнопки «Выйти со всех устройств» не проверялся. |
| 2. Административная панель | Реализовано в коде | [`app/admin/page.tsx`](../app/admin/page.tsx), [`app/moderation/ModerationClient.tsx`](../app/moderation/ModerationClient.tsx), [`app/api/buildings/[id]/revisions/route.ts`](../app/api/buildings/%5Bid%5D/revisions/route.ts) | Production-проверка аудита, мягкого удаления и восстановления не выполнялась. |
| 3. Инфраструктура и размещение серверов | Внешняя проверка | [`app/api/health/route.ts`](../app/api/health/route.ts), [`scripts/backup-database.sh`](../scripts/backup-database.sh), [`docs/stage-1-operations.md`](stage-1-operations.md) | V2 работает в Vercel Production и соединяется с PostgreSQL. Для private Blob проверены запись, чтение и удаление временного объекта; анонимный запрос к нему получил HTTP 403. Регион приложения пока не выбран по реальным замерам игроков. Восстановление из backup и загрузка через сам сайт ещё не проверялись. |
| 4. Создание и редактирование построек | Реализовано в коде | [`app/buildings/BuildingForm.tsx`](../app/buildings/BuildingForm.tsx), [`app/api/buildings/route.ts`](../app/api/buildings/route.ts), [`lib/nbt.ts`](../lib/nbt.ts) | Private Blob прошёл отдельную проверку записи и чтения, анонимное скачивание получило HTTP 403. Production-загрузка схемы/скриншота через интерфейс и восстановление версии не проверялись. |
| 5. Таблица сбора блоков и ресурсов | Реализовано в коде | [`app/buildings/[id]/BuildingChecklist.tsx`](../app/buildings/%5Bid%5D/BuildingChecklist.tsx), [`app/api/buildings/[id]/materials/[materialId]/route.ts`](../app/api/buildings/%5Bid%5D/materials/%5BmaterialId%5D/route.ts), [`app/buildings/[id]/LiveSync.tsx`](../app/buildings/%5Bid%5D/LiveSync.tsx), [`app/api/buildings/[id]/events/route.ts`](../app/api/buildings/%5Bid%5D/events/route.ts), [`lib/building-sync.ts`](../lib/building-sync.ts) | Аутентифицированный SSE-поток отправляет событие только при сдвиге общего cursor; stream ограничен 25 секундами при `maxDuration = 30`, затем EventSource переподключается. Каждое открытие проверяет сессию и временный пароль; длительные соединения увеличивают расход Vercel и запросы к PostgreSQL. |
| 6. Общий UX/UI | Реализовано в коде | [`app/layout.tsx`](../app/layout.tsx), [`app/globals.css`](../app/globals.css), [`components/AppHeader.tsx`](../components/AppHeader.tsx) | Полный ручной аудит клавиатуры, контраста и мобильных экранов не выполнялся. |
| 7. Каталог построек | Реализовано в коде | [`app/page.tsx`](../app/page.tsx), [`components/BuildingCatalog.tsx`](../components/BuildingCatalog.tsx) | Production-проверка выдачи, пагинации и производительности не выполнялась. |
| 8. Совместная работа и организация строительства | Реализовано в коде | [`app/buildings/[id]/CollaborationPanel.tsx`](../app/buildings/%5Bid%5D/CollaborationPanel.tsx), [`app/api/buildings/[id]/tasks/route.ts`](../app/api/buildings/%5Bid%5D/tasks/route.ts), [`app/api/buildings/[id]/comments/route.ts`](../app/api/buildings/%5Bid%5D/comments/route.ts) | Сквозной сценарий нескольких production-пользователей не подтверждён. |
| 9. Уведомления | Частично | [`lib/notifications.ts`](../lib/notifications.ts), [`app/notifications/NotificationsClient.tsx`](../app/notifications/NotificationsClient.tsx), [`prisma/schema.prisma`](../prisma/schema.prisma) | Внутренний центр и настройки готовы. Telegram отложен как будущая интеграция; внешняя доставка не реализуется в этой версии. |
| 10. Безопасность | Реализовано в коде | [`lib/security.ts`](../lib/security.ts), [`lib/permissions.ts`](../lib/permissions.ts), [`app/api/uploads/route.ts`](../app/api/uploads/route.ts) | Для private Blob проверено, что анонимный запрос получает HTTP 403. Полный production security review и проверка лимитов/загрузки через приложение ещё не выполнялись. |
| 11. Архитектура и хранение данных | Частично | [`prisma/schema.prisma`](../prisma/schema.prisma), [`prisma/migrations/20261014010000_builder_v2/migration.sql`](../prisma/migrations/20261014010000_builder_v2/migration.sql), [`lib/prisma.ts`](../lib/prisma.ts) | Обе новые миграции применены к production PostgreSQL 14 октября 2026 года. Сверка числа перенесённых старых записей с backup и проверка восстановления ещё не выполнены. |
| 12. Статистика и аналитика | Реализовано в коде | [`app/profile/page.tsx`](../app/profile/page.tsx), [`app/page.tsx`](../app/page.tsx), [`app/buildings/[id]/BuildingChecklist.tsx`](../app/buildings/%5Bid%5D/BuildingChecklist.tsx) | Нет отдельного production отчёта сверки агрегатов; ручная проверка цифр на реальных данных не выполнялась. |
| 13. Надёжность и качество приложения | Частично | [`test/material-operations.test.ts`](../test/material-operations.test.ts), [`test/material-concurrency.test.ts`](../test/material-concurrency.test.ts), [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Lint, TypeScript и unit checks пройдены. GitHub CI на Node 22.18 и 24.11 с PostgreSQL 16, миграциями и legacy fixture прошёл; локальный запуск без `TEST_DATABASE_URL` пропускает DB-сценарий конкурентных изменений. |
| 14. Перенос данных из существующей версии | Внешняя проверка | [`scripts/migrate-sqlite-buildings.mjs`](../scripts/migrate-sqlite-buildings.mjs), [`docs/stage-1-operations.md`](stage-1-operations.md), [`prisma/migrations/20261014010000_builder_v2/migration.sql`](../prisma/migrations/20261014010000_builder_v2/migration.sql) | Импорт старой БД не выполнялся и по текущему решению пользователя не требуется. Backup, тестовая миграция и rollback production не подтверждены. |
| 15. Дополнительные идеи на будущее | Частично | [`app/warehouse/page.tsx`](../app/warehouse/page.tsx), [`app/city-needs/page.tsx`](../app/city-needs/page.tsx), [`docs/antville-builder-2.0.md`](antville-builder-2.0.md) | Общий склад и потребности города реализованы. Minecraft-интеграция (плагин, игровые события и координаты из игры) отложена и не блокирует текущую версию. |
| 16. Порядок реализации | Частично | [`docs/antville-builder-2.0.md`](antville-builder-2.0.md), [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), эта карта статуса | Этапы сверены ниже; production-контур и внешние интеграции остаются незакрытыми. |

## Статус этапов реализации

| Этап | Статус | Что подтверждено в коде | Что осталось |
| --- | --- | --- | --- |
| 1. Безопасная основа | Частично | Аккаунты, роли, сессии, минимальная админка, серверная валидация, аудит, backup-команда и Prisma migration присутствуют. V2-миграции применены в production; вход администратора проверен. | Backup/recovery не проверены. Production smoke-check остальных пользовательских сценариев не завершён. |
| 2. Основная функциональность | Реализовано в коде | Редактор, `.litematic`/`.schem`, `.txt`/`.log`, парсер, расчёты стаков/шалкеров, частичный сбор и резервации реализованы. | Реальные файлы и PostgreSQL-сценарии не прогонялись в production. |
| 3. Совместная работа | Реализовано в коде | Ответственный, задачи, комментарии, вклад, доставка, история, идемпотентные операции и SSE-синхронизация карточки реализованы. | SSE работает ограниченными окнами с автоматическим переподключением; конфликтный многопользовательский production-сценарий не подтверждён. |
| 4. Интерфейс | Реализовано в коде | Каталог, карточки, адаптивные формы, фильтры, сортировка, пагинация, профиль и сохранение фильтров реализованы. | Полный ручной UX/accessibility аудит и production smoke-check не выполнены. |
| 5. Расширение | Частично | Внутренние уведомления, профильная статистика, общий склад и потребности города реализованы. | Telegram и Minecraft integration оставлены будущими идеями; production-инфраструктура не подтверждена. |

## Проверки и production-развёртывание

Проверено 14 октября 2026 года:

- `npm run lint -- --quiet` — успешно;
- `npm run typecheck` — успешно;
- `npm test` — успешно, 7 test files; локальная DB-проверка конкуренции пропущена без `TEST_DATABASE_URL`, а PostgreSQL-сценарий отдельно прошёл в GitHub CI;
- `npx prisma validate` — успешно;
- локальная Next.js production build — успешно;
- обе новые Prisma-миграции применены Vercel Production build; повторная production-сборка сообщила `No pending migrations to apply`;
- `https://antville.vercel.app/api/health` — HTTP 200, ответ `{"status":"ok"}` на production-коммите `2167b28964339fa45fe95dcf5ceaaab24fdf6028`; deployment PR #12 завершился успешно;
- `/login` — HTTP 200; production-вход `only1stumpy` проверен после смены пароля, флаг `mustChangePassword` снят; страницы `/admin` и `/moderation` вернули HTTP 200;
- временный bootstrap endpoint удалён и возвращает HTTP 404 на production;
- private Blob Store: временный объект записан, прочитан с серверной авторизацией и удалён; запрос без авторизации получил HTTP 403. Загрузка/скачивание через форму сайта и восстановление версии остаются непроверенными;
- Markdown validator, `git diff --check` и JSON-проверка `vercel.json` проходят.

Preview-сборки сейчас пропускаются, поскольку Preview и Production настроены на одну базу PostgreSQL. Включайте Preview только после подключения отдельной тестовой базы. GitHub CI на двух версиях Node и PostgreSQL 16 прошёл; реальные загрузки Blob, восстановление backup и полное ручное тестирование production остаются внешними проверками. Для выдачи роли `MODERATOR` используйте [панель администратора и production runbook](production-moderator.md).
