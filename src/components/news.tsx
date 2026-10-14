import type { Article } from "../lib/api";
import { timeAgo } from "../lib/format";

export function NewsCard({ a, index = 0 }: { a: Article; index?: number }) {
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      className="news-card glass"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
    >
      <div className="img">{a.image && <img src={a.image} alt="" loading="lazy" />}</div>
      <div className="body">
        <h3>{a.headline}</h3>
        {a.description && <p>{a.description}</p>}
        {a.published && <span className="when">{timeAgo(a.published)}</span>}
      </div>
    </a>
  );
}

export function NewsFeature({ a }: { a: Article }) {
  return (
    <a href={a.url} target="_blank" rel="noopener noreferrer" className="news-feature">
      {a.image && <img src={a.image} alt="" />}
      <div className="body">
        <span className="pill" style={{ background: "rgba(255,255,255,.18)", color: "#fff", backdropFilter: "blur(10px)" }}>
          Top story · {timeAgo(a.published)}
        </span>
        <h2>{a.headline}</h2>
        {a.description && <p>{a.description}</p>}
      </div>
    </a>
  );
}
