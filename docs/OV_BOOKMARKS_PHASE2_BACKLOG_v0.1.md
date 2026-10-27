# OV Bookmarks — Deferred / Phase 2 Backlog v0.1

**Назначение:** отдельное ТЗ для сложных функций, чтобы не раздувать Railway MVP.
**Связанное ТЗ:** OV_BOOKMARKS_RAILWAY_MVP_v0.1.md
**Статус:** backlog only. Реализация не разрешается без отдельной оценки и тестов MVP.

## A. Smart / Dynamic Workspaces

### Цель

Workspace автоматически включает/исключает links по условиям, не копируя объекты bookmarks.

### Возможная модель

- ov_workspace_rules (workspace_id, version, enabled, predicate_json, sort_json, updated_at, last_evaluated_at).
- Типы: STATIC (MVP), SMART_QUERY (future), SUGGESTED_BY_LLM (future).
- Predicate DSL (типизированный JSON): поле, operator, value; логические AND/OR/NOT; только allowlisted поля.
- Источники: topic/case, workflow flags, rating, review priority, domains, imports, opens, source.
- Inference-driven inclusion — **proposal only** (подтверждение владельца), не автоудаление.
- Пересчёт по on-change + periodic sweep; explanation «почему ссылка в подборке».
- При конфликте ручного включения и rules — явные override include/exclude.

### Сложность

Rule engine, обратные зависимости, live events, устойчивые сортировки и риск бесконечных пересчётов. Не включать до появления реальных сценариев.

## B. Расширенная синхронизация браузеров

- Floccus: стратегию двусторонней синхронизации folder/tag/state, конфликтов и мягкого удаления проверить отдельно.
- Chrome/Edge/Firefox: дополнение «Save all tabs / selected tabs» и snapshots вкладок; permissions minimization, browser tests.
- Tab lifecycle: active/inactive, opened/closed, workspace timeline; ручное восстановление сессии.
- История посещений браузеров: только явно включаемое расширение с прозрачным scope, без передачи приватных URL по умолчанию.
- Дедупликация при редиректах/shorteners, canonical URL с ручными overrides.

## C. Автоматическое «когда пригодится»

- Кейс-триггеры: условие + текстовая цель + теги + ожидаемое действие.
- Поиск по формулировке пользовательской задачи с объяснимым ранжированием.
- Предложения появления полезного link при работе над задачей в Sites/ChatGPT.
- Сначала eval-корпус (20–50 задач), precision@k и false-positive контроль; без непрошеных уведомлений и без передачи приватных данных внешним системам.
- На MVP кейсы остаются **только каталогизируемыми метаданными**.

## D. Полный поиск/индексирование

- Добавить Meilisearch как отдельный Railway service с volume и private networking.
- Индексировать актуальное содержимое, topics, cases, notes, task-assessments.
- Тесты после ребилда индекса, recovery, ACL per-user и пересборка при миграциях.
- Semantic search / embeddings — только после проверки provider и backend index.

## E. Глубокое архивирование страниц

- Chrome headless и скриншоты, JS-render, PDF, периодические snapshots, version diff.
- Специальный budget/storage quota, SSRF controls и timeout per-domain.
- Не увеличивать стоимость Railway в MVP без фактической необходимости.

## F. Advanced AI

- Несколько моделей и prompt sets, автоматические nightly evaluation jobs.
- Confidence и disagreement, human override, калибровка рейтингов, provenance/trace.
- Scenario relevance rank и рекомендации в реальном времени.
- Streaming AI explanation и живой review-поток при просмотре.
- Критерии: не стирать low rating archived resources; сохранить оценки моделей раздельно.

## G. UX следующего уровня

- Canvas / graph view, similarity links, 3-panel reader, индивидуальная настройка информационной плотности.
- Планировщик «просмотреть N наиболее важных» и возврат забытых ресурсов (Serendipity).
- Сложные multi-user/shared workspaces и кастомные дашборды.
- Keyboard-first mass triage с virtual scrolling на 50–100 тысяч ссылок.

## H. Полноценный ChatGPT MCP/OAuth и Sites

- Если стандартный ChatGPT Plugin connection не принимает безопасную bearer-схему, отдельное согласованное ТЗ для OAuth 2.1 / PKCE / discovery / refresh.
- Расширенные tools: «найди для моей задачи», batch reassessment, proposals/approve, полный аудит.
- Site connector UI widgets и подписки на изменения; многосайтовый реестр access policies.
- Не обходить тарифные ограничения ChatGPT попыткой предоставить открытый write endpoint.

## Gate: когда планировать следующий этап

Приступать после выполнения MVP S0–S4 и недельной реальной эксплуатации с подтверждёнными bottlenecks. Каждый крупный модуль — отдельное короткое ТЗ с test/rollback criteria.
