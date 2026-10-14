import { Link } from "react-router-dom";
import { IconBall } from "../components/Icons";
import { t } from "../i18n";
import { useDocumentTitle } from "../lib/hooks";

export default function NotFound() {
  useDocumentTitle(t("Page not found"));
  return (
    <div className="page">
      <div className="empty glass" style={{ marginTop: 40 }}>
        <div className="ic">
          <IconBall />
        </div>
        <h3>{t("Off the pitch")}</h3>
        <p>{t("This page doesn’t exist, or the link has moved.")}</p>
        <Link to="/" className="btn">
          {t("Back to scores")}
        </Link>
      </div>
    </div>
  );
}
