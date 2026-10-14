import { useState } from "react";
import { t } from "../i18n";
import type { Article } from "../lib/api";
import { timeAgo } from "../lib/format";
import { IconExternal, IconNews } from "./Icons";

/** Image that fades in once decoded and falls back to a quiet placeholder. */
function Photo({ src, eager }: { src: string; eager?: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "err">("loading");
  if (!src || state === "err")
    return (
      <span className="ix-news-ph" aria-hidden>
        <IconNews />
      </span>
    );
  return (
    <img
      src={src}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={`ix-news-img${state === "ok" ? " ok" : ""}`}
      onLoad={() => setState("ok")}
      onError={() => setState("err")}
    />
  );
}

export function NewsCard({ a, index = 0 }: { a: Article; index?: number }) {
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      className="news-card glass"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
      aria-label={`${a.headline}${a.published ? ` · ${timeAgo(a.published)}` : ""} · ${t("Opens in a new tab")}`}
    >
      <div className="img">
        <Photo src={a.image} />
      </div>
      <div className="body">
        <h3>{a.headline}</h3>
        {a.description && <p>{a.description}</p>}
        <span className="when">
          {a.published ? timeAgo(a.published) : ""}
          <IconExternal className="ix-ext" width={13} height={13} aria-hidden />
        </span>
      </div>
    </a>
  );
}

export function NewsFeature({ a }: { a: Article }) {
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      className="news-feature"
      aria-label={`${t("Top story")}: ${a.headline} · ${t("Opens in a new tab")}`}
    >
      <Photo src={a.image} eager />
      <div className="body">
        <span className="pill ix-feature-pill">
          {t("Top story")}
          {a.published ? ` · ${timeAgo(a.published)}` : ""}
        </span>
        <h2>{a.headline}</h2>
        {a.description && <p>{a.description}</p>}
      </div>
    </a>
  );
}
