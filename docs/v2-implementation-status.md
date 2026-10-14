# Статус реализации Antville Builder 2.0

Карта сверяет требования из [`docs/antville-builder-2.0.md`](antville-builder-2.0.md) с текущим кодом и эксплуатационными документами. Статус `Реализовано в коде` означает, что для требования есть рабочая реализация в репозитории. Он не заменяет проверку на production. `Частично` означает, что часть требования реализована, а часть явно указана в ограничениях. `Внешняя проверка` означает, что подтверждение зависит от production, PostgreSQL, Vercel или реальных сетей игроков.

## Сводка по разделам ТЗ

| Раздел ТЗ | Статус | Доказательства | Остаток и ограничение |
| --- | --- | --- | --- |
| 1. Авторизация и система аккаунтов | Реализовано в коде | [`lib/auth.ts`](../lib/auth.ts), [`app/api/admin/users/route.ts`](../app/api/admin/users/route.ts), [`app/profile/page.tsx`](../app/profile/page.tsx) | Production smoke-check входа, смены пароля и выхода со всех устройств не выполнялся. |
| 2. Административная панель | Реализовано в коде | [`app/admin/page.tsx`](../app/admin/page.tsx), [`app/moderation/ModerationClient.tsx`](../app/moderation/ModerationClient.tsx), [`app/api/buildings/[id]/revisions/route.ts`](../app/api/buildings/%5Bid%5D/revisions/route.ts) | Production-проверка аудита, мягкого удаления и восстановления не выполнялась. |
| 3. Инфраструктура и размещение серверов | Внешняя проверка | [`app/api/health/route.ts`](../app/api/health/route.ts), [`scripts/backup-database.sh`](../scripts/backup-database.sh), [`docs/stage-1-operations.md`](stage-1-operations.md) | Регион Vercel пока не выбран: нет фактических замеров из сетей игроков России и Приднестровья. Связка региона Vercel с PostgreSQL и production backup/recovery не подтверждена. |
| 4. Создание и редактирование построек | Реализовано в коде | [`app/buildings/BuildingForm.tsx`](../app/buildings/BuildingForm.tsx), [`app/api/buildings/route.ts`](../app/api/buildings/route.ts), [`lib/nbt.ts`](../lib/nbt.ts) | Фактическая загрузка файлов в production Blob и сценарий восстановления версии не проверялись. |
| 5. Таблица сбора блоков и ресурсов | Частично | [`app/buildings/[id]/BuildingChecklist.tsx`](../app/buildings/%5Bid%5D/BuildingChecklist.tsx), [`app/api/buildings/[id]/materials/[materialId]/route.ts`](../app/api/buildings/%5Bid%5D/materials/%5BmaterialId%5D/route.ts), [`app/buildings/[id]/LiveSync.tsx`](../app/buildings/%5Bid%5D/LiveSync.tsx) | Синхронизация сделана authenticated polling раз в 5 секунд с обновлением состояния и повторным подключением; WebSocket/realtime-транспорт из ТЗ не реализован. |
| 6. Общий UX/UI | Реализовано в коде | [`app/layout.tsx`](../app/layout.tsx), [`app/globals.css`](../app/globals.css), [`components/AppHeader.tsx`](../components/AppHeader.tsx) | Полный ручной аудит клавиатуры, контраста и мобильных экранов не выполнялся. |
| 7. Каталог построек | Реализовано в коде | [`app/page.tsx`](../app/page.tsx), [`components/BuildingCatalog.tsx`](../components/BuildingCatalog.tsx) | Production-проверка выдачи, пагинации и производительности не выполнялась. |
| 8. Совместная работа и организация строительства | Реализовано в коде | [`app/buildings/[id]/CollaborationPanel.tsx`](../app/buildings/%5Bid%5D/CollaborationPanel.tsx), [`app/api/buildings/[id]/tasks/route.ts`](../app/api/buildings/%5Bid%5D/tasks/route.ts), [`app/api/buildings/[id]/comments/route.ts`](../app/api/buildings/%5Bid%5D/comments/route.ts) | Сквозной сценарий нескольких production-пользователей не подтверждён. |
| 9. Уведомления | Частично | [`lib/notifications.ts`](../lib/notifications.ts), [`app/notifications/NotificationsClient.tsx`](../app/notifications/NotificationsClient.tsx), [`prisma/schema.prisma`](../prisma/schema.prisma) | Внутренний центр и настройки готовы. Telegram отложен как будущая интеграция; внешняя доставка не реализуется в этой версии. |
| 10. Безопасность | Реализовано в коде | [`lib/security.ts`](../lib/security.ts), [`lib/permissions.ts`](../lib/permissions.ts), [`app/api/uploads/route.ts`](../app/api/uploads/route.ts) | Нужны production security review и проверка лимитов/приватного Blob в реальном окружении. |
| 11. Архитектура и хранение данных | Частично | [`prisma/schema.prisma`](../prisma/schema.prisma), [`prisma/migrations/20261014010000_builder_v2/migration.sql`](../prisma/migrations/20261014010000_builder_v2/migration.sql), [`lib/prisma.ts`](../lib/prisma.ts) | Схема, индексы, транзакции и private Blob описаны в коде; применение миграций к PostgreSQL и production release не подтверждены. |
| 12. Статистика и аналитика | Реализовано в коде | [`app/profile/page.tsx`](../app/profile/page.tsx), [`app/page.tsx`](../app/page.tsx), [`app/buildings/[id]/BuildingChecklist.tsx`](../app/buildings/%5Bid%5D/BuildingChecklist.tsx) | Нет отдельного production отчёта сверки агрегатов; ручная проверка цифр на реальных данных не выполнялась. |
| 13. Надёжность и качество приложения | Частично | [`test/material-operations.test.ts`](../test/material-operations.test.ts), [`test/material-concurrency.test.ts`](../test/material-concurrency.test.ts), [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Локальные проверки прошли, но GitHub CI с PostgreSQL для текущего состояния, `prisma migrate deploy` на PostgreSQL и production выпуск не подтверждены. |
| 14. Перенос данных из существующей версии | Внешняя проверка | [`scripts/migrate-sqlite-buildings.mjs`](../scripts/migrate-sqlite-buildings.mjs), [`docs/stage-1-operations.md`](stage-1-operations.md), [`prisma/migrations/20261014010000_builder_v2/migration.sql`](../prisma/migrations/20261014010000_builder_v2/migration.sql) | Импорт старой БД не выполнялся и по текущему решению пользователя не требуется. Backup, тестовая миграция и rollback production не подтверждены. |
| 15. Дополнительные идеи на будущее | Частично | [`app/warehouse/page.tsx`](../app/warehouse/page.tsx), [`app/city-needs/page.tsx`](../app/city-needs/page.tsx), [`docs/antville-builder-2.0.md`](antville-builder-2.0.md) | Общий склад и потребности города реализованы. Minecraft-интеграция (плагин, игровые события и координаты из игры) отложена и не блокирует текущую версию. |
| 16. Порядок реализации | Частично | [`docs/antville-builder-2.0.md`](antville-builder-2.0.md), [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), эта карта статуса | Этапы сверены ниже; production-контур и внешние интеграции остаются незакрытыми. |

## Статус этапов реализации

| Этап | Статус | Что подтверждено в коде | Что осталось |
| --- | --- | --- | --- |
| 1. Безопасная основа | Частично | Аккаунты, роли, сессии, минимальная админка, серверная валидация, аудит, backup-команда и Prisma migration присутствуют. | Применение миграции, backup/recovery и выпуск в production не подтверждены. |
| 2. Основная функциональность | Реализовано в коде | Редактор, `.litematic`/`.schem`, `.txt`/`.log`, парсер, расчёты стаков/шалкеров, частичный сбор и резервации реализованы. | Реальные файлы и PostgreSQL-сценарии не прогонялись в production. |
| 3. Совместная работа | Частично | Ответственный, задачи, комментарии, вклад, доставка, история и идемпотентные операции реализованы. | Вместо WebSocket используется polling 5 секунд; конфликтный многопользовательский production-сценарий не подтверждён. |
| 4. Интерфейс | Реализовано в коде | Каталог, карточки, адаптивные формы, фильтры, сортировка, пагинация, профиль и сохранение фильтров реализованы. | Полный ручной UX/accessibility аудит и production smoke-check не выполнены. |
| 5. Расширение | Частично | Внутренние уведомления, профильная статистика, общий склад и потребности города реализованы. | Telegram и Minecraft integration оставлены будущими идеями; production-инфраструктура не подтверждена. |

## Проверенные команды

Локально прошли:

- `git diff --check`;
- `npm run lint`;
- `npm run typecheck`;
- `npm test` без `TEST_DATABASE_URL` и с безопасным локальным значением `DATABASE_URL` (7 файлов тестов; интеграционный callback без тестовой БД пропускается);
- `npx prisma validate`;
- `npm run build -- --webpack` с тестовым значением `BLOB_READ_WRITE_TOKEN`.

Обычный Turbopack-вызов `npm run build` в этом sandbox не прошёл из-за запрета окружения на bind порта; webpack-сборка прошла. Это не является подтверждением production-сборки.

Не подтверждены: PostgreSQL `prisma migrate deploy` в доступной production/test базе, GitHub CI для текущего набора изменений, Vercel production release и production smoke-check. Продакшен-БД и production секреты из этой проверки не изменялись.
