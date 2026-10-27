# OV Bookmarks — Railway MVP v0.1

**Статус:** implementation-ready specification; код не реализован, деплой не выполнен.
**Дата:** 2026-10-27
**Репозиторий:** https://github.com/oovac/ov-bookmarks (форк Karakeep)
**Целевой домен:** https://bookmarks.mirador.click (домен подтверждается владельцем / DNS)
**Задача:** минимально развернуть личную библиотеку закладок с рабочим UI, антидублями, кейсами применения, оценками, workspaces, Cerebras и интеграциями ChatGPT/Sites.

## 0. Приоритеты и принцип реализации

1. **Рабочее приложение, а не редизайн.** Переиспользовать существующие Karakeep: авторизацию, bookmarks, favourites, archive, tags/lists, HTML-импорт, REST API, расширение и workers.
2. **Одно приложение Railway + один Volume** (SQLite и assets), без Meilisearch, внешнего Chrome, Redis, PostgreSQL и отдельных LLM-worker сервисов на MVP.
3. **Изолированное OV-расширение** над существующей моделью через собственные таблицы, сервисы и UI, не ломая upstream-структуру и миграции.
4. **Сначала сохранность и удобный workflow.** Динамическая классификация, live browser sync и полноценный интеллектуальный поиск — отдельный этап.
5. **Сохранять существующую Karakeep API-совместимость** для расширений, мобильных клиентов, импорта и Floccus.

### Терминологические решения

- Слово «Cerberos» в запросе трактуется как **Cerebras Inference**, не как отдельный продукт Cerberos. Провайдер и модель параметризованы.
- «На случай» = полезно **при определённом условии** (много кейсов на одну ссылку); «на будущее» = отложенная потенциальная потребность **без конкретного триггера**.
- «Часто хожу» — вычисляется по **зафиксированным открытиям внутри нашего приложения**; полная история Chrome/Edge/Safari не считывается в MVP.
- «Табы попадают в workspace» = **снимок текущих вкладок**, не постоянная фоновая слежка за браузером.
- Основная таксономия «по теме» и «по кейсу использования» — независимые, **many-to-many**, в обоих случаях допустимо несколько значений.

## 1. Деплой Railway (обязательный)

### 1.1 Сборка из форка

- Источник: GitHub oovac/ov-bookmarks, ветка main после принятия изменений.
- Монорепозиторий root остаётся корнем build context.
- Существующий **docker/Dockerfile** заканчивается стадией **mcp**, поэтому нельзя просто указать этот Dockerfile как Railway build: последняя стадия по умолчанию не является веб-приложением.
- Добавить в конец docker/Dockerfile одну финальную стадию:

~~~dockerfile
# Railway default target: web + workers + migrations
FROM aio AS railway
~~~

- Railway: builder Dockerfile, RAILWAY_DOCKERFILE_PATH=docker/Dockerfile, build context — корень репозитория. Проверить успешный старт финального образа с /init и доступность HTTP на 3000.
- Если Railway-сборка из исходников упирается в ресурсы/время из-за Rust/Next.js: **отдельный запасной путь** — GitHub Actions собирает тот же aio/railway образ в GHCR по commit SHA, Railway деплоит конкретный digest. Нельзя переключаться на официальный upstream-образ, иначе OV-изменений не будет.

### 1.2 Volume, сеть, переменные

- Один сервис ov-bookmarks, один Railway Volume с mountPath=/data, одна реплика.
- Порт приложения PORT=3000; healthcheck HTTP GET /api/health; HTTPS публично.
- Обязательные env: DATA_DIR=/data, NEXTAUTH_URL=https://bookmarks.mirador.click, NEXTAUTH_SECRET=(случайные 32+ байта), PORT=3000, LOG_LEVEL=warn.
- После создания первого admin: DISABLE_SIGNUPS=true; не блокировать собственный вход. Для новых пользователей отдельного сценария пока нет.
- Не задавать MEILI_ADDR / BROWSER_WEB_URL / BROWSER_WEBSOCKET_URL.
- Для экономии: CRAWLER_STORE_SCREENSHOT=false, CRAWLER_NUM_WORKERS=1, EMBEDDING_ENABLE_AUTO_INDEXING=false, SEMANTIC_SEARCH_ENABLED=false.
- Права volume: проверить возможность записи SQLite для процесса контейнера; при проблеме выполнить документированный Railway permissions workaround, не делать бездумный chown /data при каждом запуске.
- Ежедневные Railway volume backups + проверенная инструкция restore. SQLite переносить/резервировать консистентно, не копировать открытый файл как единственный backup.
- Встроенные migration jobs выполняются при старте aio, **не через Railway pre-deploy**: volume там ещё не смонтирован.

### 1.3 Домен

DNS-проверка на 2026-10-27: mirador.click имеет NS на name.com; mirador.link не вернул делегированных DNS-записей. Для bookmarks.mirador.click записи пока не обнаружены. Это не доказывает право владения доменом.

1. Начать с временного HTTPS railway.app.
2. Прикрепить bookmarks.mirador.click к Railway Web service.
3. Скопировать из Railway **фактически выданные CNAME и TXT**, добавить в DNS; дождаться verified + SSL.
4. Переключить NEXTAUTH_URL и перезапустить сервис после подтверждения HTTPS.
5. Если собственность на mirador.click не подтверждается, оставить параметр OV_PUBLIC_URL и выбрать доступный домен; **не угадывать** .link.

## 2. Объект Link и жизненный цикл

**Единственный канонический объект ссылки** — штатный Karakeep bookmark с ID и original URL. Не плодить новые bookmarks для различных workspaces или кейсов.

### 2.1 Признаки состояния (допускают сочетания)

| UI-состояние | Физическое хранение | Поведение |
|---|---|---|
| ⭐ Избранное | существующее Karakeep favourited | pin / быстрый доступ |
| 👀 Надо просмотреть | OV review_priority 1..5 (NULL = не в очереди) | очередь сортируется по приоритету |
| 🧰 На случай | OV for_case flag + 0..N case-триггеров | найти по условию «когда понадобится…» |
| 🔮 На будущее | OV for_future boolean | отдельный отложенный раздел |
| 📦 Архив | существующий Karakeep archived | не мешает в активной очереди, остаётся для дедупликации |

- Метки не взаимоисключающие: fav + needs_review + future допустимо.
- Архив **не удаляет** оценки, кейсы, вложения, принадлежность workspace и счётчики.
- Плохая оценка (например 1/5) и архив — допустимое сочетание; рейтинг не должен автоматически удалять объект.
- На первом добавлении: все четыре признака пусты/false (кроме явно заданных), сохраняется Unsorted / Inbox.
- В UI можно поставить/снять любой признак одним нажатием; review_priority не требует обязательно читать материал сейчас.

### 2.2 Пользовательская оценка

- user_rating: nullable integer 1..5 («нет оценки» отдельно от 1).
- user_comment: nullable text, редактируемый; история самой оценки пока не нужна.
- Не совмещать пользовательский рейтинг и AI score: разные владельцы суждения, отдельно сортируются.
- Допускается сортировка по 1..5, без оценки, плохие (1..2), хорошие (4..5).

## 3. Две таксономии и использование по кейсам

- **Topics**: темы (AI, research, frontend, grants…), many-to-many.
- **Cases**: конкретные сценарии применения; many-to-many. Поля case: label, optional trigger_description («Если…»), optional parent_id (для будущей иерархии), optional comment.
- В одной ссылке 0..N topics и 0..N cases; один и тот же case может встречаться у тысяч ссылок.
- Case — **типизированный термин**, не просто свободный текст. При добавлении есть autocomplete и кнопка «новый случай»; в карточке видны короткие метки.
- Пользовательская заметка к ссылке отдельна от описаний кейсов.
- Не создавать полноценное дерево/онтологию и автоматический inference кейсов в MVP.
- Существующие нативные tags Karakeep не уничтожать; миграцию/привязку к Topics реализовывать без потери исходных тегов.

## 4. Workspace и снимки вкладок

- Workspace = именованная проектная подборка: name, description, owner_id, timestamps.
- Одна закладка может входить в **несколько** workspaces; один workspace содержит произвольное количество ссылок.
- Workspace имеет простой статический список links и список snapshots вкладок; элементы доступны через тот же Bookmark ID.
- Веб-интерфейс: создать Workspace, выбрать текущий, добавить/убрать links, открыть список tabs/snapshots.
- MVP приём вкладок:
  1) paste N URLs + выбрать workspace;
  2) импорт OneTab / Tab Session Manager / bookmark HTML с выбором workspace;
  3) опционально минимальная кнопка в форке Chrome/Edge extension **Save current window tabs to Workspace**, если сборка расширения проходит без отдельной сложной переработки. В противном случае — вынести кнопку в этап 2, не блокировать релиз.
- Snapshot сохраняет время, источник, список ID ссылок и, если доступно, заголовок окна; **не** отслеживает вкладки постоянно.
- Никакой динамической подписки на новые вкладки/папки на MVP. Заранее создать модуль OV Smart Workspace (интерфейс/тип/README, feature flag off), без исполняющего rule engine.

## 5. Массовое добавление и антидубли

- Вход: одна ссылка, пачка URL (новые строки), существующий HTML importer Karakeep, OneTab/Tab Session Manager, расширения, REST/MCP.
- Для всех входов **единый upsert path**: штатный createBookmark + OV mapping.
- Canonical key: (user_id, normalized_url); нормализация осторожная: lower-case host/scheme, default port, убрать fragment, известные tracking params (utm_*, fbclid/gclid) только по явному списку, сохранить значимые query/path.
- Импорт *не должен обнулять* уже выставленные user_rating, comment, statuses, cases, archived и workspace memberships.
- Обнаружены дубли — переиспользовать существующий bookmark ID; разрешается **добавить** новый workspace/source; не объединять conflicting пользовательские поля молча.
- Нужен отчет импорта: total, created, existing, invalid, failed, attached_to_workspace, downloadable errors.
- Тест идемпотентности: повторить импорт того же файла — новых записей 0; содержимое не повреждено.
- Защититься от ссылок javascript:, file:, localhost/внутренних host при SSRF/crawler; URL-протоколы строго http/https.

## 6. История открытий и частота

- Сохранять только открытия, инициированные **нашим web UI** (кнопка Open в приложении или внутренний redirect route). Историю браузера извне не перехватывать.
- ov_open_events: bookmark_id, user_id, timestamp, source (web, workspace, sites, mcp где применимо).
- Денормализованные поля/вычисления: total_open_count, opens_7d, opens_30d, last_opened_at.
- UI: «Недавно открытые», «Часто открываемые»; сортировки lastOpened, openCount(30d).
- Важная оговорка в UI: прямое открытие сайта через браузерную адресную строку не учитывается.
- Один явный клик = одно событие; превью без перехода можно считать отдельно лишь позднее.

## 7. LLM-оценки и Cerebras

### 7.1 Отдельные оценки по задачам

- Для каждого bookmark 0..N **assessment slots**:
  - task (строка или выбранный тип задачи);
  - provider, model, prompt_version;
  - score nullable 1..5;
  - comment nullable text;
  - status: empty / running / complete / failed;
  - optional assessed_at, input_excerpt, error_code.
- Пустая заготовка с задачей допускается, даже когда score/comment ещё NULL. Можно вручную редактировать score и комментарий? Нет: AI-оценка — выход модели; для личного мнения есть отдельный user_rating/comment.
- Примеры task: «полезность для OV», «качество технического источника», «пригодность для грантов». Названия свободные, hardcoded набор не нужен.
- Результаты разных задач/моделей сохраняются отдельно, новый запуск не стирает старый; UI по умолчанию показывает последнюю оценку на задачу.
- MVP: **только запуск по кнопке или API/MCP**, не оценивать тысячи импортированных ссылок автоматически.

### 7.2 Cerebras как быстрый runtime

Cerebras подключать через совместимый с OpenAI endpoint https://api.cerebras.ai/v1 (это трактовка «cerberos»):
- secrets: CEREBRAS_API_KEY в Railway; при использовании штатного inference Karakeep — OPENAI_API_KEY с тем же значением через secret reference Railway, OPENAI_BASE_URL=https://api.cerebras.ai/v1.
- INFERENCE_TEXT_MODEL=gpt-oss-120b (на момент ТЗ доступен, на старте validate models / живой inference call; не полагаться на model defaults Karakeep).
- INFERENCE_OUTPUT_SCHEMA=structured после smoke-теста; при 400/несовместимости переключить json или plain с Zod-валидацией.
- Не включать автоматически image inference: сначала проверить поддерживаемый vision model отдельно.
- OV assessment service: одиночный быстрый LLM-запрос с title/url/description и, если доступно, extracted text; валидировать score 1..5, сохранять provider+model+task+комментарий; ошибка оставляет пустой/failed слот, не ломает bookmark.
- UX: spinner, retry, timeout, cancel; если streaming поддержан, показывать прогресс/текст частями, **но streaming не должен блокировать MVP**.
- Не передавать ключ в браузер/Sites. Ограничить размер содержимого, конкуренцию и стоимость. Webpage текст — недоверенные данные, не управляющие инструкции.

## 8. UI MVP

Переиспользовать существующий Karakeep layout, не переписывать дизайн целиком.

**Навигация:** Inbox / Favourites / To Review / For Case / Future / Frequently Opened / Recently Opened / Archive / Workspaces.

**Главная:** быстрый список карточек + переключатели List / Compact / Grid, фильтры сверху, раскрытие деталей в side panel или существующем popup.

**Карточка:** favicon/preview/title/domain, статусы ⭐👀🧰🔮📦, review priority, user stars, одна-две taxonomy labels, multi-select checkbox, Open. Не показывать все поля сразу, чтобы не утяжелять сетку.

**Инспектор:** URL, редактируемый title/description, user rating/comment, subjects & cases multi-select, кейсы с условиями, AI assessments (пустые и завершённые), workspace memberships, число открытий, archive.

**Bulk actions:** add/remove topics/cases, set status, priority, archive/unarchive, add/remove workspace, delete с явным подтверждением.

**Фильтры** (логика AND между группами, OR внутри multi-select): статус, archived, favourite, priority, user rating range/unrated, AI task & score/no-score, topics, cases, workspace, date created, domain, source, last opened, opened frequency.

**Сортировки:** newest/oldest, title/domain, review_priority desc, user rating desc/asc, lastOpened, opens30d, recent import, AI score по выбранной задаче. Стабильная вторичная сортировка по ID.

- Без Meilisearch сделать native SQL filters для собственных полей и доступных metadata; **не выдавать** это за общий full-text search.
- 1k–5k элементов: server-side pagination + индексы на фильтры, lazy images; без загрузки всех карточек в память.

## 9. API, MCP, интеграция ChatGPT и Sites — входят в MVP

### 9.1 API (изолированный контракт OV)

Сохранить оригинальные /api/v1 Karakeep. Добавить OV namespace (например /api/ov/v1) с:
- links.list/get/upsert/update (включая meta, статусы, фильтры, сортировку);
- links.bulkImport, links.open;
- taxonomies.list/create/assign;
- workspaces.list/create/add/remove/importTabs;
- assessments.list/prepare/run;
- stats.recent/frequent.

Каждый endpoint scoped к authenticated user, JSON response, Zod validation, безопасный pagination cursor, max batch limits, нормальные коды ошибок. Если часть уже есть в штатном Karakeep API — **адаптер**, а не переписывание.

### 9.2 MCP для ChatGPT (не отложить!)

- Существующий apps/mcp/src/index.ts использует **serveStdio**. Это не публичный HTTP MCP.
- Добавить **Streamable HTTP MCP** endpoint по HTTPS (предпочтительно в том же Railway web service, например /api/ov/mcp) с существующими bookmark/list/tag tools и OV tools. Если внутри Next.js runtime SDK не поддерживает нужный transport, допускается очень маленький sidecar server, но **не поднимать второй сервис без необходимости**.
- Минимальные инструменты: ov_bookmarks_list, ov_bookmarks_get, ov_bookmarks_add, ov_bookmarks_update, ov_bookmarks_bulk_add, ov_taxonomy_list, ov_taxonomy_assign, ov_workspace_list, ov_workspace_add_links, ov_assessment_list, ov_assessment_run.
- MCP auth: серверная проверка Bearer token, привязка к одному user ID, разделение read/write прав, rate limits, audit log. Если текущий ChatGPT connection flow требует OAuth 2.x — использовать поддерживаемый OAuth flow; **не публиковать незащищённый MCP ради скорости**. Не помещать постоянные API keys в URL.
- Подключить ChatGPT в Plugins → Add custom MCP server (если план/Workspace разрешают), URL публичного HTTPS endpoint. Проверить discover tools, list, read и write; зафиксировать в отчёте недоступность write, если ограничение тарифного плана, а не ложный green check.
- MCP search без Meili не подменять фиктивным full-text: сделать ov_bookmarks_list с фильтрами, а native search-bookmarks явно сообщать SearchUnavailable.
- Упомянутый нами пакет @karakeep/mcp остаётся usable для Codex/Claude Desktop через stdio отдельно от HTTP gateway.

### 9.3 Подключение наших ChatGPT Sites

- **Путь интеграции:** тот же OV REST API; отдельные API consumers и SDK/client helper в packages/ov-sdk или аналогичном небольшом пакете.
- Первая проверка — один наш Site: открыть карточку ссылки и нажать «Сохранить в OV Bookmarks»; привязать topic/case/workspace; из OV Bookmarks перейти обратно в Site.
- В архитектуре предусмотреть реестр Site origins/clients, scope read/write, displayName, optional sourceSiteId; одни и те же API для остальных Sites.
- Если Site имеет безопасный серверный секрет — server-to-server; если только браузерный JS, применять user OAuth/авторизованную сессию + CORS allowlist, **не встраивать приватный API token в HTML**.
- Список всех Sites/идентификаторов пока не задан — оставить конфигурируемый реестр и один реально протестированный пример, не выдумывать адреса и доступы.

## 10. Данные и миграции (OV namespace)

Предпочтительно отдельные Drizzle tables с FK на существующие bookmarks/users:
- ov_link_meta (bookmark_id PK, user_id, review_priority?, for_case, for_future, user_rating?, user_comment?, timestamps);
- ov_terms (id, user_id, kind: topic|case, name, trigger_description?, parent_id?, comment?; UNIQUE(user,kind,normalized_name));
- ov_link_terms (bookmark_id, term_id; composite PK);
- ov_workspaces (id, owner_id, name, description?, created_at);
- ov_workspace_links (workspace_id, bookmark_id, added_at, source_capture_id?; composite PK);
- ov_tab_captures (id, workspace_id, browser?, label?, captured_at);
- ov_open_events (id, user_id, bookmark_id, source, opened_at);
- ov_ai_assessments (id, bookmark_id, user_id, task, provider?, model?, prompt_version?, score?, comment?, status, created_at, completed_at?).

FK cascade только на удаляемые вложенные OV-записи. Soft archive в базовом bookmarks table не трогать. Включить индексы по (user_id, priority/rating), (kind,name), (workspace_id, bookmark_id), (bookmark_id,opened_at), (bookmark_id,task,created_at). Не модифицировать существующие Karakeep migration files задним числом; создать новую миграцию.

## 11. Вехи и критерии приёмки

**S0 — Railway bootstrap:** 1 сервис, volume, health, регистрация admin, login, DNS/SSL, повторный restart сохраняет 10 тестовых bookmarks. Build обязан идти из форка. Rollback documented.

**S1 — данные и UI:** четыре независимых признака, личная оценка+комментарий, две multi-taxonomies, архив, фильтры и сортировки. Проверить все комбинации, включая rating=1 + archived.

**S2 — массовый поток/workspaces:** HTML + bulk URLs, создание workspace, прикрепление нескольких links, импорт tabs snapshot; 1000 входных URL с 100 повторами — 900 unique или меньше при уже существующих, повторный импорт не увеличивает число links; отчёт корректен.

**S3 — посещения + Cerebras:** нажатие Open дважды создаёт 2 события, opens30d/lastOpen корректны; по заданию модели создаётся оценка 1..5 с comment, пустые slots допускаются; недоступность Cerebras не блокирует остальные функции.

**S4 — ChatGPT MCP + Sites:** публичный TLS endpoint c authentication, ChatGPT tool discovery (если доступ по тарифу), чтение/запись links и оценок при разрешении; demo «сохранить из Site» c отдельной авторизацией. Если write запрещён планом ChatGPT — отдельно фиксируем blocker платформы, не называем задачу полностью закрытой.

**Baseline QA:** pnpm typecheck, lint, targeted Vitest, migration up/down or restore, import idempotence, authorization isolation, REST smoke, MCP integration smoke, browser UI smoke на desktop; rollback и backup restore smoke. Не отключать тесты ради зелёного deploy.

### Минимальные критерии безопасности

Private by default; disable signups после bootstrap; HTTPS; secrets только Railway; deny-list private/internal IP при fetch URLs (использовать уже имеющуюся защиту Karakeep); scopes; explicit confirm for bulk destructive actions; export данных для ухода с платформы. MCP/Sites вызовы не могут читать чужие workspaces.

## 12. Что сознательно НЕ входит в v0.1

- Meilisearch: полнотекстовый/векторный поиск, поиск по содержимому.
- Внешний Chrome: скриншоты и JS-rendered snapshots.
- Live sync всех браузерных вкладок, browser history и расширенная телеметрия.
- Динамические/умные Workspaces, cron-based rules, автоматическое перемещение по триггерам.
- Автоматический ночной ranking 100k links, сравнение разных LLM, сложная taxonomy ontology.
- Публичные/командные workspaces, granular RBAC для нескольких людей.
- Полный новый дизайн, Canvas, graph view и рекомендации по связям.

Их детализирует **OV_BOOKMARKS_PHASE2_BACKLOG_v0.1.md**. Любая задача, которая требует заметной смены архитектуры, оформляется отдельно, не блокируя S0–S4.

## 13. Проверенные опоры

- Код: https://github.com/oovac/ov-bookmarks
- Форк: docker/Dockerfile; packages/db/schema.ts; packages/api/routes/bookmarks.ts; apps/mcp/src/index.ts.
- Minimal Karakeep: https://docs.karakeep.app/installation/minimal-install/
- Karakeep env: https://docs.karakeep.app/configuration/environment-variables/
- Karakeep AI: https://docs.karakeep.app/configuration/different-ai-providers/
- Karakeep MCP: https://docs.karakeep.app/integrations/mcp/
- Railway custom Dockerfile: https://docs.railway.com/builds/dockerfiles
- Railway domains: https://docs.railway.com/networking/domains/working-with-domains
- Railway volumes/backups: https://docs.railway.com/volumes
- Cerebras compat: https://inference-docs.cerebras.ai/resources/openai
- ChatGPT custom MCP: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt

**Готовность:** это ТЗ и acceptance gates, не отчёт об уже выполненном деплое или интеграциях.
