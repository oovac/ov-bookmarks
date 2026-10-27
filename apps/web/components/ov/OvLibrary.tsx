"use client";

import { useEffect, useState } from "react";
import {
  Archive,
  ArrowDownToLine,
  Briefcase,
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  FolderPlus,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  Star,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { inferRouterOutputs } from "@trpc/server";
import type { ovAppRouter } from "@karakeep/trpc/routers/ov";

type Outputs = inferRouterOutputs<typeof ovAppRouter>;
type LinkRow = Outputs["list"]["items"][number];
type Term = Outputs["taxonomyList"][number];
type Workspace = Outputs["workspaceList"][number];
type View =
  | "all"
  | "inbox"
  | "favourites"
  | "review"
  | "case"
  | "future"
  | "frequent"
  | "recent"
  | "archive";
const views: { id: View; label: string }[] = [
  { id: "inbox", label: "Входящие" },
  { id: "all", label: "Все ссылки" },
  { id: "favourites", label: "Избранное" },
  { id: "review", label: "Просмотреть" },
  { id: "case", label: "На случай" },
  { id: "future", label: "На будущее" },
  { id: "frequent", label: "Часто открываю" },
  { id: "recent", label: "Недавние" },
  { id: "archive", label: "Архив" },
];
const selectClass =
  "h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
async function request<T>(
  operation: string,
  args: unknown = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/ov/v1/${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      response.status === 401
        ? "Сессия истекла. Войди снова."
        : text.slice(0, 250) || "Не удалось выполнить действие",
    );
  }
  return response.json() as Promise<T>;
}
function dateLabel(value: unknown) {
  if (!value) return "—";
  return new Date(
    typeof value === "number" ? value * 1000 : String(value),
  ).toLocaleString("ru-RU");
}
function Stars({
  value,
  onChange,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
}) {
  return (
    <div
      className="flex items-center gap-0.5"
      role="group"
      aria-label="Личная оценка"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          title={`${n} из 5`}
          aria-label={`${n} из 5`}
          aria-pressed={value === n}
          onClick={() => onChange(value === n ? null : n)}
          className="rounded p-1 text-muted-foreground hover:text-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star
            size={16}
            className={
              value && n <= value ? "fill-amber-500 text-amber-600" : ""
            }
          />
        </button>
      ))}
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export default function OvLibrary() {
  const [view, setView] = useState<View>("inbox");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [workspace, setWorkspace] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [prev, setPrev] = useState<(string | undefined)[]>([]);
  const [data, setData] = useState<Outputs["list"]>();
  const [terms, setTerms] = useState<Term[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [inspected, setInspected] = useState<string | null>(null);
  const [mode, setMode] = useState("list");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importLinks, setImportLinks] = useState<
    { url: string; title?: string }[] | null
  >(null);
  const [snapshot, setSnapshot] = useState(false);
  const [report, setReport] = useState<Outputs["bulkImport"]>();
  const [newWorkspace, setNewWorkspace] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [filter, setFilter] = useState({
    rating: "",
    priority: "",
    topicIds: [] as string[],
    caseIds: [] as string[],
    domain: "",
    source: "",
    createdAfter: "",
    createdBefore: "",
    openedAfter: "",
    opensMin: "",
    aiTask: "",
    aiScore: "",
  });
  const [captures, setCaptures] = useState<Outputs["captures"]>([]);
  const refresh = () => setRevision((n) => n + 1);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      request<Term[]>("taxonomyList", {}, controller.signal),
      request<Workspace[]>("workspaceList", {}, controller.signal),
    ])
      .then(([t, w]) => {
        setTerms(t);
        setWorkspaces(w);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e.message));
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      const unix = (s: string) =>
        s ? Math.floor(new Date(s).getTime() / 1000) : undefined;
      request<Outputs["list"]>(
        "list",
        {
          view,
          q: query || undefined,
          sort,
          workspaceId: workspace || undefined,
          cursor,
          limit: 40,
          unrated: filter.rating === "none" || undefined,
          ...(Number(filter.rating)
            ? {
                ratingMin: Number(filter.rating),
                ratingMax: Number(filter.rating),
              }
            : {}),
          priorityMin: filter.priority ? Number(filter.priority) : undefined,
          topicIds: filter.topicIds,
          caseIds: filter.caseIds,
          domain: filter.domain || undefined,
          source: filter.source || undefined,
          createdAfter: unix(filter.createdAfter),
          createdBefore: filter.createdBefore
            ? unix(filter.createdBefore)! + 86399
            : undefined,
          openedAfter: unix(filter.openedAfter),
          opensMin: filter.opensMin ? Number(filter.opensMin) : undefined,
          aiTask: filter.aiTask || undefined,
          aiScoreMin: Number(filter.aiScore) || undefined,
          aiUnrated: filter.aiScore === "none" || undefined,
        },
        controller.signal,
      )
        .then(setData)
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [view, query, sort, workspace, cursor, filter, revision]);
  useEffect(() => {
    setCursor(undefined);
    setPrev([]);
    setSelected([]);
  }, [view, query, sort, workspace, filter]);
  useEffect(() => {
    if (!workspace) {
      setCaptures([]);
      return;
    }
    const controller = new AbortController();
    request<Outputs["captures"]>(
      "captures",
      { workspaceId: workspace },
      controller.signal,
    )
      .then(setCaptures)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [workspace, revision]);
  async function act(operation: string, args: unknown) {
    setBusy(true);
    setError("");
    try {
      await request(operation, args);
      refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка запроса");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function openLink(row: LinkRow) {
    const win = window.open("about:blank", "_blank");
    if (win) win.opener = null;
    try {
      const saved = await request<{ url: string }>("open", {
        bookmarkId: row.id,
        source: workspace ? "workspace" : "web",
      });
      if (win) win.location = saved.url;
      else
        setNotice(
          "Браузер заблокировал новую вкладку. Разреши всплывающие окна для открытия ссылки.",
        );
      refresh();
    } catch (e) {
      win?.close();
      setError(String(e instanceof Error ? e.message : e));
    }
  }
  async function fileImport(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setError("Файл больше 10 МБ");
      return;
    }
    try {
      const text = await file.text();
      let links: { url: string; title?: string }[] = [];
      if (/\.html?$/i.test(file.name)) {
        const doc = new DOMParser().parseFromString(text, "text/html");
        links = Array.from(doc.querySelectorAll("a[href]")).map((a) => ({
          url: a.getAttribute("href")!,
          title: a.textContent || undefined,
        }));
      } else if (/\.json$/i.test(file.name)) {
        const walk = (value: unknown) => {
          if (Array.isArray(value)) value.forEach(walk);
          else if (value && typeof value === "object") {
            const v = value as Record<string, unknown>;
            if (typeof v.url === "string")
              links.push({
                url: v.url,
                title: typeof v.title === "string" ? v.title : undefined,
              });
            for (const [key, x] of Object.entries(v))
              if (key !== "url" && key !== "title") walk(x);
          }
        };
        walk(JSON.parse(text));
      } else
        links = text
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => ({ url: s.split(/\s+\|\s+/)[0] }));
      if (!links.length) throw new Error("В файле не найдены ссылки");
      setImportLinks(links);
      setImportText(`${links.length} ссылок из ${file.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось прочитать файл");
    }
  }
  async function importBatch() {
    const links =
      importLinks ||
      importText
        .split(/\r?\n/)
        .map((url) => ({ url: url.trim() }))
        .filter((x) => x.url);
    if (!links.length) return;
    setBusy(true);
    setError("");
    let total: Outputs["bulkImport"] | undefined;
    try {
      for (let i = 0; i < links.length; i += 1000) {
        const r = await request<Outputs["bulkImport"]>("bulkImport", {
          links: links.slice(i, i + 1000),
          workspaceId: workspace || undefined,
          snapshot: snapshot
            ? { label: "Импорт вкладок", browser: "file/paste" }
            : undefined,
        });
        if (!total) total = r;
        else
          total = {
            ...total,
            total: total.total + r.total,
            created: total.created + r.created,
            existing: total.existing + r.existing,
            invalid: total.invalid + r.invalid,
            failed: total.failed + r.failed,
            attachedToWorkspace:
              total.attachedToWorkspace + r.attachedToWorkspace,
            errors: [
              ...total.errors,
              ...r.errors.map((e) => ({ ...e, index: e.index + i })),
            ],
            bookmarkIds: [...total.bookmarkIds, ...r.bookmarkIds],
          };
      }
      setReport(total);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Импорт прерван");
    } finally {
      setBusy(false);
    }
  }
  function download(value: unknown, name: string) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  const toggle = (bookmarkId: string) =>
    setSelected((x) =>
      x.includes(bookmarkId)
        ? x.filter((i) => i !== bookmarkId)
        : [...x, bookmarkId],
    );
  const bulk = (patch: unknown) =>
    act("bulkUpdate", { bookmarkIds: selected, patch });
  return (
    <div className="min-w-0 p-4 text-foreground md:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Моя библиотека
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ссылки, которые работают на наши задачи
          </p>
        </div>
        <Button
          onClick={() => {
            setImportOpen(true);
            setReport(undefined);
          }}
        >
          <Plus size={16} className="mr-2" />
          Добавить ссылки
        </Button>
      </header>
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start justify-between gap-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
        >
          <span>{error}</span>
          <button aria-label="Закрыть ошибку" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="mb-3 text-sm">
          {notice}
        </p>
      )}
      <nav
        aria-label="Разделы библиотеки"
        className="mb-5 flex flex-wrap gap-1 border-b pb-3"
      >
        {views.map((v) => (
          <Button
            key={v.id}
            size="sm"
            variant={view === v.id ? "secondary" : "ghost"}
            aria-pressed={view === v.id}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </Button>
        ))}
      </nav>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search
            size={16}
            className="absolute left-3 top-3 text-muted-foreground"
          />
          <Input
            aria-label="Поиск по названию, URL и комментарию"
            placeholder="Название, адрес или мой комментарий"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Workspace"
          className={selectClass}
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
        >
          <option value="">Все Workspaces</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="icon"
          title="Новый Workspace"
          aria-label="Новый Workspace"
          onClick={() => setNewWorkspace(!newWorkspace)}
        >
          <FolderPlus size={16} />
        </Button>
        <select
          aria-label="Сортировка"
          className={selectClass}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {Object.entries({
            newest: "Сначала новые",
            oldest: "Сначала старые",
            title: "По названию",
            domain: "По адресу",
            priority: "По важности",
            rating: "Лучшие оценки",
            ratingAsc: "Низкие оценки",
            lastOpened: "Последние открытия",
            opens30d: "Частота за 30 дней",
            aiScore: "Оценка LLM",
          }).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <div className="flex" role="group" aria-label="Вид списка">
          {[
            { id: "compact", icon: <List size={15} />, title: "Компактно" },
            { id: "list", icon: <List size={19} />, title: "Список" },
            { id: "grid", icon: <LayoutGrid size={17} />, title: "Карточки" },
          ].map((m) => (
            <Button
              key={m.id}
              size="icon"
              variant={mode === m.id ? "secondary" : "ghost"}
              title={m.title}
              aria-label={m.title}
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
            >
              {m.icon}
            </Button>
          ))}
        </div>
      </div>
      {newWorkspace && (
        <form
          className="mb-4 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const w = await request<Workspace>("workspaceCreate", {
                name: workspaceName,
              });
              setWorkspace(w.id);
              setNewWorkspace(false);
              setWorkspaceName("");
              refresh();
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            autoFocus
            placeholder="Название проекта"
            aria-label="Название Workspace"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            required
          />
          <Button disabled={busy || !workspaceName.trim()}>Создать</Button>
        </form>
      )}
      <details className="mb-5 rounded-md border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">
          Фильтры
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Личная оценка">
            <select
              className={selectClass}
              value={filter.rating}
              onChange={(e) => setFilter({ ...filter, rating: e.target.value })}
            >
              <option value="">Любая</option>
              <option value="none">Без оценки</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} из 5
                </option>
              ))}
            </select>
          </Field>
          <Field label="Важность просмотра">
            <select
              className={selectClass}
              value={filter.priority}
              onChange={(e) =>
                setFilter({ ...filter, priority: e.target.value })
              }
            >
              <option value="">Любая</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  От {n} из 5
                </option>
              ))}
            </select>
          </Field>
          {(["topic", "case"] as const).map((kind) => (
            <Field
              key={kind}
              label={
                kind === "topic"
                  ? "Темы (можно несколько)"
                  : "Кейсы (можно несколько)"
              }
            >
              <select
                multiple
                className={`${selectClass} h-20`}
                value={kind === "topic" ? filter.topicIds : filter.caseIds}
                onChange={(e) =>
                  setFilter({
                    ...filter,
                    [kind === "topic" ? "topicIds" : "caseIds"]: Array.from(
                      e.target.selectedOptions,
                    ).map((o) => o.value),
                  })
                }
              >
                {terms
                  .filter((t) => t.kind === kind)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </Field>
          ))}
          <Field label="Домен">
            <Input
              placeholder="github.com"
              value={filter.domain}
              onChange={(e) => setFilter({ ...filter, domain: e.target.value })}
            />
          </Field>
          <Field label="Источник">
            <select
              className={selectClass}
              value={filter.source}
              onChange={(e) => setFilter({ ...filter, source: e.target.value })}
            >
              <option value="">Любой</option>
              {["import", "web", "extension", "api", "mobile", "rss"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </Field>
          <Field label="Добавлено с">
            <Input
              type="date"
              value={filter.createdAfter}
              onChange={(e) =>
                setFilter({ ...filter, createdAfter: e.target.value })
              }
            />
          </Field>
          <Field label="Добавлено до">
            <Input
              type="date"
              value={filter.createdBefore}
              onChange={(e) =>
                setFilter({ ...filter, createdBefore: e.target.value })
              }
            />
          </Field>
          <Field label="Открывал после">
            <Input
              type="date"
              value={filter.openedAfter}
              onChange={(e) =>
                setFilter({ ...filter, openedAfter: e.target.value })
              }
            />
          </Field>
          <Field label="Открытий за месяц от">
            <Input
              type="number"
              min={0}
              value={filter.opensMin}
              onChange={(e) =>
                setFilter({ ...filter, opensMin: e.target.value })
              }
            />
          </Field>
          <Field label="Задача LLM">
            <Input
              value={filter.aiTask}
              onChange={(e) => setFilter({ ...filter, aiTask: e.target.value })}
            />
          </Field>
          <Field label="Оценка LLM">
            <select
              className={selectClass}
              value={filter.aiScore}
              onChange={(e) =>
                setFilter({ ...filter, aiScore: e.target.value })
              }
            >
              <option value="">Любая</option>
              <option value="none">Пустая</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  От {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </details>
      {selected.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-muted p-3 text-sm">
          <strong>Выбрано: {selected.length}</strong>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => bulk({ archived: view !== "archive" })}
          >
            {view === "archive" ? "Из архива" : "В архив"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => bulk({ favourited: true })}
          >
            В избранное
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => bulk({ forFuture: true })}
          >
            На будущее
          </Button>
          <select
            aria-label="Важность выбранных"
            className={selectClass}
            value=""
            onChange={(e) =>
              e.target.value && bulk({ reviewPriority: Number(e.target.value) })
            }
          >
            <option value="">Просмотреть: важность…</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <select
            aria-label="Добавить тему или кейс"
            value=""
            className={selectClass}
            onChange={(e) =>
              e.target.value &&
              act("taxonomyAssign", {
                bookmarkIds: selected,
                termIds: [e.target.value],
              })
            }
          >
            <option value="">Добавить тему / кейс…</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.kind === "topic" ? "Тема" : "Кейс"}: {t.name}
              </option>
            ))}
          </select>
          {workspace && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                act("workspaceLinks", {
                  workspaceId: workspace,
                  bookmarkIds: selected,
                  remove: true,
                })
              }
            >
              Убрать из Workspace
            </Button>
          )}
          <select
            aria-label="Добавить в Workspace"
            className={selectClass}
            value=""
            onChange={(e) =>
              e.target.value &&
              act("workspaceLinks", {
                workspaceId: e.target.value,
                bookmarkIds: selected,
              })
            }
          >
            <option value="">В Workspace…</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Снять выделение
          </Button>
        </div>
      )}
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span aria-live="polite">
          {loading ? "Загрузка…" : `${data?.total || 0} ссылок`}
        </span>
        <span>Открытия учитываются только через библиотеку</span>
      </div>
      {loading ? (
        <div className="space-y-3" aria-label="Загрузка ссылок">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <div className="py-16 text-center">
          <h2 className="text-lg font-medium">Здесь пока нет ссылок</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Добавь адреса, импортируй закладки или измени фильтры. Существующие
            ссылки сохранят свои оценки и статусы.
          </p>
          <Button className="mt-5" onClick={() => setImportOpen(true)}>
            <Upload size={16} className="mr-2" />
            Добавить или импортировать
          </Button>
        </div>
      ) : (
        <div
          className={
            mode === "grid"
              ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3"
              : "divide-y border-y"
          }
        >
          {data.items.map((row) => (
            <article
              key={row.id}
              className={
                mode === "grid"
                  ? "flex min-w-0 flex-col gap-3 rounded-xl border p-4"
                  : `flex min-w-0 items-start gap-3 ${mode === "compact" ? "py-2" : "py-4"}`
              }
            >
              <input
                aria-label={`Выбрать ${row.title || row.url}`}
                type="checkbox"
                checked={selected.includes(row.id)}
                onChange={() => toggle(row.id)}
                className="mt-1 accent-primary"
              />
              <div className="min-w-0 flex-1">
                <button
                  className="block max-w-full text-left text-sm font-semibold leading-5 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setInspected(row.id)}
                >
                  {row.title || row.url}
                </button>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {new URL(row.url).hostname}
                </p>
                {mode !== "compact" && (
                  <>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {row.description}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {row.terms.slice(0, 3).map((t) => (
                        <span
                          title={t.triggerDescription || t.kind}
                          key={t.id}
                          className="rounded bg-muted px-2 py-0.5 text-xs"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <Button
                    size="icon"
                    variant={row.favourited ? "secondary" : "ghost"}
                    className="h-8 w-8"
                    aria-label="Избранное"
                    aria-pressed={row.favourited}
                    disabled={busy}
                    onClick={() =>
                      act("update", {
                        bookmarkId: row.id,
                        favourited: !row.favourited,
                      })
                    }
                  >
                    <Star
                      size={15}
                      className={row.favourited ? "fill-current" : ""}
                    />
                  </Button>
                  <Button
                    size="icon"
                    variant={row.meta?.reviewPriority ? "secondary" : "ghost"}
                    className="h-8 w-8"
                    aria-label="Надо просмотреть"
                    aria-pressed={!!row.meta?.reviewPriority}
                    disabled={busy}
                    onClick={() =>
                      act("update", {
                        bookmarkId: row.id,
                        reviewPriority: row.meta?.reviewPriority ? null : 3,
                      })
                    }
                  >
                    <Eye size={15} />
                  </Button>
                  {row.meta?.reviewPriority && (
                    <span className="text-xs">{row.meta.reviewPriority}/5</span>
                  )}
                  {(
                    [
                      {
                        field: "forCase",
                        label: "На случай",
                        icon: <Briefcase size={15} />,
                      },
                      {
                        field: "forFuture",
                        label: "На будущее",
                        icon: <Clock size={15} />,
                      },
                    ] as const
                  ).map((b) => (
                    <Button
                      key={b.field}
                      size="icon"
                      variant={row.meta?.[b.field] ? "secondary" : "ghost"}
                      className="h-8 w-8"
                      aria-label={b.label}
                      aria-pressed={!!row.meta?.[b.field]}
                      disabled={busy}
                      onClick={() =>
                        act("update", {
                          bookmarkId: row.id,
                          [b.field]: !row.meta?.[b.field],
                        })
                      }
                    >
                      {b.icon}
                    </Button>
                  ))}
                  <Button
                    size="icon"
                    variant={row.archived ? "secondary" : "ghost"}
                    className="h-8 w-8"
                    aria-label={row.archived ? "Из архива" : "В архив"}
                    disabled={busy}
                    onClick={() =>
                      act("update", {
                        bookmarkId: row.id,
                        archived: !row.archived,
                      })
                    }
                  >
                    <Archive size={15} />
                  </Button>
                  <Stars
                    value={row.meta?.userRating}
                    onChange={(userRating) =>
                      act("update", { bookmarkId: row.id, userRating })
                    }
                  />
                  {mode !== "compact" && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      Открытий: {row.totalOpens}
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Открыть ${row.title || row.url}`}
                onClick={() => openLink(row)}
              >
                <ExternalLink size={16} />
              </Button>
            </article>
          ))}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={!prev.length || loading}
          onClick={() => {
            setCursor(prev[prev.length - 1]);
            setPrev((x) => x.slice(0, -1));
          }}
        >
          Назад
        </Button>
        <Button
          variant="outline"
          disabled={!data?.nextCursor || loading}
          onClick={() => {
            setPrev((x) => [...x, cursor]);
            setCursor(data?.nextCursor || undefined);
          }}
        >
          Далее
          <ChevronRight size={15} />
        </Button>
      </div>
      {workspace && (
        <details className="mt-6 border-t pt-4">
          <summary className="cursor-pointer text-sm font-medium">
            Снимки вкладок · {captures.length}
          </summary>
          <ul className="mt-3 space-y-2 text-sm">
            {captures.length ? (
              captures.map((c) => (
                <li key={c.id}>
                  {c.label || "Снимок вкладок"} · {dateLabel(c.capturedAt)} ·{" "}
                  {c.bookmarkIds.length} вкладок
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">
                При импорте выбери «Сохранить как снимок вкладок».
              </li>
            )}
          </ul>
        </details>
      )}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogTitle>Добавить ссылки</DialogTitle>
          <DialogDescription>
            По одному адресу на строку, HTML-закладки, OneTab или JSON Tab
            Session Manager. Дубли останутся одной ссылкой.
          </DialogDescription>
          <Textarea
            aria-label="Адреса ссылок"
            rows={7}
            placeholder="https://example.com"
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setImportLinks(null);
            }}
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Upload size={16} />
            <span>Загрузить файл</span>
            <input
              aria-label="Файл закладок или вкладок"
              type="file"
              accept=".html,.htm,.json,.txt"
              className="min-w-0 max-w-full text-xs"
              onChange={(e) =>
                e.target.files?.[0] && fileImport(e.target.files[0])
              }
            />
          </label>
          <Field label="В Workspace">
            <select
              className={selectClass}
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
            >
              <option value="">Без Workspace</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!workspace}
              checked={snapshot}
              onChange={(e) => setSnapshot(e.target.checked)}
              className="accent-primary"
            />
            Сохранить как снимок вкладок
          </label>
          <Button
            disabled={busy || !importText.trim() || (snapshot && !workspace)}
            onClick={importBatch}
          >
            {busy ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <Plus size={16} className="mr-2" />
            )}
            Сохранить
          </Button>
          {report && (
            <div
              role="status"
              className="space-y-2 rounded-md bg-muted p-3 text-sm"
            >
              <p>
                Всего {report.total} · новых {report.created} · уже были{" "}
                {report.existing}
              </p>
              <p>
                Некорректных {report.invalid} · ошибок {report.failed} ·
                добавлено в Workspace {report.attachedToWorkspace}
              </p>
              {report.errors.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    download(report.errors, "ov-import-errors.json")
                  }
                >
                  <ArrowDownToLine size={14} className="mr-2" />
                  Скачать ошибки
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!inspected} onOpenChange={(o) => !o && setInspected(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle>Карточка ссылки</DialogTitle>
          <DialogDescription>
            Личное мнение и оценки моделей хранятся отдельно.
          </DialogDescription>
          {inspected && (
            <Inspector
              key={inspected}
              bookmarkId={inspected}
              terms={terms}
              workspaces={workspaces}
              refresh={refresh}
              reportError={setError}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Inspector({
  bookmarkId,
  terms,
  workspaces,
  refresh,
  reportError,
}: {
  bookmarkId: string;
  terms: Term[];
  workspaces: Workspace[];
  refresh: () => void;
  reportError: (s: string) => void;
}) {
  const [link, setLink] = useState<LinkRow>();
  const [assessments, setAssessments] = useState<Outputs["assessmentList"]>([]);
  const [history, setHistory] = useState<Outputs["openHistory"]>([]);
  const [busy, setBusy] = useState(false);
  const [task, setTask] = useState("");
  const [termName, setTermName] = useState("");
  const [kind, setKind] = useState<"topic" | "case">("topic");
  const [trigger, setTrigger] = useState("");
  const [saved, setSaved] = useState(false);
  const load = async () => {
    const [l, a, h] = await Promise.all([
      request<LinkRow>("get", { bookmarkId }),
      request<Outputs["assessmentList"]>("assessmentList", { bookmarkId }),
      request<Outputs["openHistory"]>("openHistory", { bookmarkId }),
    ]);
    setLink(l);
    setAssessments(a);
    setHistory(h);
  };
  useEffect(() => {
    load().catch((e) => reportError(e.message));
  }, [bookmarkId]);
  async function perform(op: string, args: unknown) {
    setBusy(true);
    setSaved(false);
    try {
      await request(op, args);
      await load();
      refresh();
      setSaved(true);
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }
  if (!link) return <div className="h-48 animate-pulse rounded-md bg-muted" />;
  return (
    <div className="space-y-5">
      <p className="break-all text-xs text-muted-foreground">{link.url}</p>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          perform("update", {
            bookmarkId,
            title: String(f.get("title")),
            description: String(f.get("description")),
            userComment: String(f.get("comment")),
            userRating: f.get("rating") ? Number(f.get("rating")) : null,
            reviewPriority: f.get("priority")
              ? Number(f.get("priority"))
              : null,
            forCase: f.has("case"),
            forFuture: f.has("future"),
            favourited: f.has("favourite"),
            archived: f.has("archive"),
          });
        }}
      >
        <Field label="Название">
          <Input
            key={`title-${link.title}`}
            name="title"
            defaultValue={link.title || ""}
          />
        </Field>
        <Field label="Описание">
          <Textarea
            key={`desc-${link.description}`}
            name="description"
            rows={2}
            defaultValue={link.description || ""}
          />
        </Field>
        <div className="flex flex-wrap gap-4">
          {[
            { name: "favourite", label: "Избранное", value: link.favourited },
            { name: "case", label: "На случай", value: link.meta?.forCase },
            {
              name: "future",
              label: "На будущее",
              value: link.meta?.forFuture,
            },
            { name: "archive", label: "Архив", value: link.archived },
          ].map((b) => (
            <label
              key={`${b.name}-${b.value}`}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                name={b.name}
                defaultChecked={!!b.value}
                className="accent-primary"
              />
              {b.label}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Важность просмотра">
            <select
              className={selectClass}
              key={`priority-${link.meta?.reviewPriority}`}
              name="priority"
              defaultValue={link.meta?.reviewPriority || ""}
            >
              <option value="">Не в очереди</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} из 5
                </option>
              ))}
            </select>
          </Field>
          <Field label="Моя оценка">
            <select
              className={selectClass}
              key={`rating-${link.meta?.userRating}`}
              name="rating"
              defaultValue={link.meta?.userRating || ""}
            >
              <option value="">Без оценки</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} из 5
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Мой комментарий">
          <Textarea
            key={`comment-${link.meta?.userComment}`}
            name="comment"
            rows={3}
            defaultValue={link.meta?.userComment || ""}
          />
        </Field>
        <div className="flex items-center gap-3">
          <Button disabled={busy}>Сохранить изменения</Button>
          {saved && (
            <span role="status" className="flex items-center gap-1 text-sm">
              <Check size={15} />
              Сохранено
            </span>
          )}
        </div>
      </form>
      <section className="border-t pt-4">
        <h3 className="mb-3 text-sm font-semibold">Темы и кейсы</h3>
        <div className="flex flex-wrap gap-2">
          {terms.map((t) => (
            <Button
              key={t.id}
              title={t.triggerDescription || undefined}
              size="sm"
              variant={
                link.terms.some((x) => x.id === t.id) ? "secondary" : "outline"
              }
              disabled={busy}
              onClick={() =>
                perform("taxonomyAssign", {
                  bookmarkIds: [bookmarkId],
                  termIds: [t.id],
                  remove: link.terms.some((x) => x.id === t.id),
                })
              }
            >
              {t.kind === "case" ? (
                <Briefcase size={12} className="mr-1" />
              ) : null}
              {t.name}
            </Button>
          ))}
        </div>
        <form
          className="mt-3 grid gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const term = await request<Term>("taxonomyCreate", {
                kind,
                name: termName,
                triggerDescription: kind === "case" ? trigger : undefined,
              });
              await perform("taxonomyAssign", {
                bookmarkIds: [bookmarkId],
                termIds: [term.id],
              });
              setTermName("");
              setTrigger("");
            } catch (e) {
              reportError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="flex gap-2">
            <select
              aria-label="Тип термина"
              className={selectClass}
              value={kind}
              onChange={(e) => setKind(e.target.value as "topic" | "case")}
            >
              <option value="topic">Тема</option>
              <option value="case">Кейс</option>
            </select>
            <Input
              aria-label="Новая тема или кейс"
              list="ov-terms"
              placeholder="Название"
              value={termName}
              onChange={(e) => setTermName(e.target.value)}
              required
            />
            <datalist id="ov-terms">
              {terms
                .filter((t) => t.kind === kind)
                .map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
            </datalist>
            <Button
              disabled={busy || !termName.trim()}
              size="icon"
              aria-label="Создать и назначить термин"
            >
              <Plus size={16} />
            </Button>
          </div>
          {kind === "case" && (
            <Input
              aria-label="Условие применения"
              placeholder="Пригодится, когда…"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
            />
          )}
        </form>
        {link.terms
          .filter((t) => t.triggerDescription)
          .map((t) => (
            <p key={t.id} className="mt-2 text-xs text-muted-foreground">
              {t.name}: {t.triggerDescription}
            </p>
          ))}
      </section>
      <section className="border-t pt-4">
        <h3 className="mb-3 text-sm font-semibold">Workspaces</h3>
        <div className="flex flex-wrap gap-2">
          {workspaces.length ? (
            workspaces.map((w) => (
              <Button
                size="sm"
                key={w.id}
                variant={
                  link.workspaceIds.includes(w.id) ? "secondary" : "outline"
                }
                disabled={busy}
                onClick={() =>
                  perform("workspaceLinks", {
                    workspaceId: w.id,
                    bookmarkIds: [bookmarkId],
                    remove: link.workspaceIds.includes(w.id),
                  })
                }
              >
                {w.name}
              </Button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Создай Workspace в панели библиотеки.
            </p>
          )}
        </div>
      </section>
      <section className="border-t pt-4">
        <h3 className="mb-3 text-sm font-semibold">Оценки LLM по задачам</h3>
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            perform("assessmentRun", { bookmarkId, task });
          }}
        >
          <Input
            aria-label="Задача для оценки LLM"
            placeholder="Например, полезность для проекта OV"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            required
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !task.trim()}>
              {busy && <Loader2 size={15} className="mr-2 animate-spin" />}
              Оценить через Cerebras
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !task.trim()}
              onClick={() => perform("assessmentPrepare", { bookmarkId, task })}
            >
              Пустой слот
            </Button>
          </div>
        </form>
        <ul className="mt-4 divide-y">
          {assessments.map((a) => (
            <li key={a.id} className="py-3 text-sm">
              <p className="font-medium">
                {a.task}{" "}
                <span className="font-normal text-muted-foreground">
                  {a.score
                    ? `${a.score}/5`
                    : a.status === "empty"
                      ? "Ожидает оценки"
                      : a.status === "failed"
                        ? "Ошибка"
                        : a.status === "running"
                          ? "Выполняется"
                          : ""}
                </span>
              </p>
              <p className="mt-1">{a.comment || a.errorCode}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {a.provider} {a.model} · {dateLabel(a.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <details className="border-t pt-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Открытия · {link.totalOpens} всего · {link.opens30d} за месяц
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Прямые посещения из браузера не учитываются.
        </p>
        <ul className="mt-2 space-y-1 text-xs">
          {history.map((h) => (
            <li key={h.id}>
              {dateLabel(h.openedAt)} · {h.source}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
