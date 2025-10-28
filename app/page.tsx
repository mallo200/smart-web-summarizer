"use client";

import { useEffect, useMemo, useState } from "react";

type Summary = {
  id: number;
  url: string;
  title: string;
  bullets: string[];
  created_at: string;
};

const LOCAL_KEY = "sws_history_v1";

function loadLocalHistory(): Summary[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(LOCAL_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) return parsed as Summary[];
    return [];
  } catch {
    return [];
  }
}

function saveLocalHistory(items: Summary[]) {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
    }
  } catch {}
}

function removeFromHistory(items: Summary[], entry: Pick<Summary, "id" | "url">): Summary[] {
  return items.filter((i) => !(i.id === entry.id && i.url === entry.url));
}

function upsertByUrl(items: Summary[], entry: Summary): Summary[] {
  const without = items.filter((i) => i.url !== entry.url);
  return [entry, ...without];
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestSummary, setLatestSummary] = useState<Pick<Summary, "title" | "bullets"> | null>(null);
  const [localHistory, setLocalHistory] = useState<Summary[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setLocalHistory(loadLocalHistory());
  }, []);


  async function handleSummarize() {
    setError(null);
    setIsSummarizing(true);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        throw new Error("Échec de la génération du résumé");
      }
      const payload: { id: number; url: string; title: string; bullets: string[]; created_at: string } = await res.json();
      const normalized = {
        title: payload.title ?? "Résumé",
        bullets: Array.isArray(payload.bullets) ? payload.bullets : [],
      };
      setLatestSummary(normalized);
      setIsExpanded(false);
      const created: Summary = {
        id: payload.id,
        url: payload.url,
        title: payload.title,
        bullets: normalized.bullets,
        created_at: payload.created_at,
      };
      setLocalHistory((prev) => {
        const next = upsertByUrl(prev, created);
        saveLocalHistory(next);
        return next;
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Une erreur est survenue";
      setError(message);
    } finally {
      setIsSummarizing(false);
    }
  }

  const isUrlValid = useMemo(() => {
    try {
      if (!url) return false;
      const u = new URL(url);
      return Boolean(u.protocol && u.host);
    } catch {
      return false;
    }
  }, [url]);

  // Auto-prefix protocol on blur if missing
  function ensureProtocol(value: string): string {
    if (!value) return value;
    try {
      // If URL constructor fails, try prefixing
      new URL(value);
      return value;
    } catch {
      if (/^\w+\.\w+/.test(value)) {
        return `https://${value}`;
      }
      return value;
    }
  }

  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col gap-10 py-16 px-6 sm:px-10 bg-white dark:bg-black">
        <header className="flex flex-col gap-2">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Smart Web Summarizer
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400">Collez une URL et obtenez un résumé concis.</p>
          </div>
        </header>

        <section className="flex flex-col gap-2">
          <label htmlFor="url" className="text-sm font-medium text-black dark:text-zinc-100">
            URL à résumer
          </label>
          <div className="flex flex-col sm:flex-row gap-3 items-stretch">
            <div className="relative flex-1">
              <input
                id="url"
                type="url"
                inputMode="url"
                placeholder="https://exemple.com/article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={(e) => setUrl(ensureProtocol(e.target.value))}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || (e.key.toLowerCase() === "enter" && (e.metaKey || e.ctrlKey))) && isUrlValid && !isSummarizing) {
                    e.preventDefault();
                    handleSummarize();
                  }
                }}
                autoFocus
                aria-describedby={`url-help${url && !isUrlValid ? " url-error" : ""}`}
                aria-invalid={Boolean(url) && !isUrlValid}
                className={`w-full h-12 rounded-lg border bg-white dark:bg-zinc-900 pl-4 pr-16 py-3 text-black dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 ${
                  url
                    ? isUrlValid
                      ? "border-emerald-400/50 focus:ring-emerald-500/20"
                      : "border-red-300 focus:ring-red-500/20"
                    : "border-black/10 dark:border-white/20 focus:ring-zinc-800/10 dark:focus:ring-white/10"
                }`}
              />
              {url && isUrlValid && (
                <span className="absolute right-9 top-1/2 -translate-y-1/2 text-emerald-500" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
              {url && (
                <button
                  type="button"
                  onClick={() => setUrl("")}
                  aria-label="Effacer"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-zinc-800/10 dark:focus:ring-white/10"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={handleSummarize}
              disabled={!isUrlValid || isSummarizing}
              className="w-full sm:w-auto shrink-0 h-12 rounded-lg bg-black text-white dark:bg-white dark:text-black px-5 font-medium focus:outline-none focus:ring-2 focus:ring-zinc-800/10 dark:focus:ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSummarizing ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" d="M4 12a8 8 0 018-8" fill="currentColor" />
                  </svg>
                  Résumé en cours…
                </span>
              ) : (
                "Résumer"
              )}
            </button>
          </div>
          <p id="url-help" className="text-xs text-zinc-500 dark:text-zinc-400">
            Entrez une URL complète (https://…).
          </p>
          {url && !isUrlValid && (
            <p id="url-error" className="text-xs text-red-600 dark:text-red-300">
              URL invalide. Vérifiez le format.
            </p>
          )}
        </section>

        {error && (
          <div role="alert" aria-live="assertive" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-900/30 dark:bg-red-950/40 dark:text-red-200">
            <div className="flex items-start justify-between gap-4">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="text-sm opacity-70 hover:opacity-100">Fermer</button>
            </div>
          </div>
        )}

        <section aria-labelledby="dernier-resume" aria-live="polite" className="flex flex-col gap-3">
          <h2 id="dernier-resume" className="text-xl font-semibold text-black dark:text-zinc-50">
            Nouveau résumé
          </h2>
          {isSummarizing ? (
            <div className="rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-zinc-900 p-5 animate-pulse">
              <div className="h-5 w-2/3 bg-zinc-200 dark:bg-zinc-800 rounded" />
              <div className="mt-3 space-y-2">
                <div className="h-3 w-full bg-zinc-200 dark:bg-zinc-800 rounded" />
                <div className="h-3 w-11/12 bg-zinc-200 dark:bg-zinc-800 rounded" />
                <div className="h-3 w-10/12 bg-zinc-200 dark:bg-zinc-800 rounded" />
              </div>
            </div>
          ) : latestSummary ? (
            <article className="rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-zinc-900 p-5 transition-all hover:border-black/20 dark:hover:border-white/25 hover:shadow-sm">
              <div className="flex items-start gap-3">
                {/* Favicon */}
                {url && (
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(url)}&sz=64`}
                    alt=""
                    width={20}
                    height={20}
                    className="mt-1 rounded-sm"
                  />
                )}
                <h3 className="text-lg font-medium text-black dark:text-zinc-100 flex-1">{latestSummary.title}</h3>
              </div>
              <ul className="mt-2 list-disc pl-5 text-zinc-700 dark:text-zinc-300">
                {(isExpanded ? latestSummary.bullets : latestSummary.bullets.slice(0, 3)).map((point, idx) => (
                  <li key={idx} className="line-clamp-2">{point}</li>
                ))}
              </ul>
              {latestSummary.bullets.length > 3 && (
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    className="text-sm underline text-zinc-700 hover:text-black dark:text-zinc-300 dark:hover:text-white"
                    onClick={() => setIsExpanded((v) => !v)}
                  >
                    {isExpanded ? "Afficher moins" : "Afficher plus"}
                  </button>
                  <button
                    type="button"
                    className="text-sm underline text-zinc-700 hover:text-black dark:text-zinc-300 dark:hover:text-white"
                    onClick={async () => {
                      const text = [latestSummary.title, ...(latestSummary.bullets)].join("\n- ");
                      const ok = await copyToClipboard(text);
                      setToast(ok ? "Résumé copié" : "Impossible de copier");
                      setTimeout(() => setToast(null), 2000);
                    }}
                  >
                    Copier tout
                  </button>
                </div>
              )}
            </article>
          ) : (
            <p className="text-zinc-600 dark:text-zinc-400">Aucun résumé généré pour l’instant.</p>
          )}
        </section>

        <section aria-labelledby="mon-historique" className="flex flex-col gap-3 pb-12">
          <h2 id="mon-historique" className="text-xl font-semibold text-black dark:text-zinc-50">
            Mon Historique
          </h2>
          {localHistory.length === 0 ? (
            <p className="text-zinc-600 dark:text-zinc-400">Aucun élément dans l’historique.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {localHistory.map((s) => (
                <li key={`${s.id}-${s.url}`} className="rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-zinc-900 p-5 transition-all hover:border-black/20 dark:hover:border-white/25 hover:shadow-sm">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="block focus:outline-none focus:ring-2 focus:ring-zinc-800/10 dark:focus:ring-white/10 rounded-md">
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(s.url)}&sz=64`}
                          alt=""
                          width={16}
                          height={16}
                          className="rounded-sm shrink-0"
                        />
                        <h3 className="text-lg font-medium text-black dark:text-zinc-100 line-clamp-2">{s.title}</h3>
                      </div>
                      <time className="text-xs text-zinc-500 dark:text-zinc-400">
                        {new Date(s.created_at).toLocaleDateString()}
                      </time>
                    </div>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 truncate">{s.url}</p>
                    <ul className="mt-2 list-disc pl-5 text-zinc-700 dark:text-zinc-300">
                      {(Array.isArray(s.bullets) ? s.bullets : []).slice(0, 3).map((b, i) => (
                        <li key={i} className="line-clamp-2">{b}</li>
                      ))}
                    </ul>
                  </a>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      className="text-sm underline text-zinc-700 hover:text-black dark:text-zinc-300 dark:hover:text-white"
                      onClick={async () => {
                        const text = [s.title, ...((Array.isArray(s.bullets) ? s.bullets : []).slice(0, 3))].join("\n- ");
                        const ok = await copyToClipboard(text);
                        setToast(ok ? "Résumé copié" : "Impossible de copier");
                        setTimeout(() => setToast(null), 2000);
                      }}
                    >
                      Copier le résumé
                    </button>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm underline text-zinc-700 hover:text-black dark:text-zinc-300 dark:hover:text-white">
                      Ouvrir l’article
                    </a>
                    <button
                      type="button"
                      aria-label={`Supprimer ${s.title}`}
                      className="text-sm text-red-600 hover:text-red-700 underline"
                      onClick={() => {
                        setLocalHistory((prev) => {
                          const next = removeFromHistory(prev, { id: s.id, url: s.url });
                          saveLocalHistory(next);
                          return next;
                        });
                        setToast("Élément supprimé");
                        setTimeout(() => setToast(null), 2000);
                      }}
                    >
                      Supprimer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        {toast && (
          <div className="fixed inset-x-0 bottom-4 flex justify-center px-4">
            <div className="rounded-md bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm shadow-md">
              {toast}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
