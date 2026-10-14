import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * iOS-style shrinking large title. When the current page's
 * `.page .large-title` scrolls under the nav, a compact title fades/slides
 * into the nav bar. Works for every page without page changes: the title is
 * found via a MutationObserver on <main> (pages render asynchronously) and
 * watched with an IntersectionObserver. Placement is measured so the nav
 * layout never shifts: centred on phones (between the brand mark and the
 * actions), and in place of the wordmark on wider screens.
 */
export function NavTitle() {
  const { pathname } = useLocation();
  const [text, setText] = useState("");
  const [show, setShow] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number; center: boolean } | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  // Find the title and watch it.
  useEffect(() => {
    const main = document.getElementById("main");
    if (!main) return;
    let current: Element | null = null;
    let io: IntersectionObserver | null = null;
    let raf = 0;

    const navBottom = () => {
      const nav = document.querySelector(".nav");
      return nav ? Math.round(nav.getBoundingClientRect().bottom) : 64;
    };

    const attach = () => {
      raf = 0;
      const title = main.querySelector(".page .large-title");
      // Pages may offer a shorter form for the bar via data-compact.
      const label = (title?.getAttribute("data-compact") || title?.textContent || "").trim();
      setText(label);
      if (title === current) return;
      io?.disconnect();
      current = title;
      if (!title || typeof IntersectionObserver === "undefined") {
        setShow(false);
        return;
      }
      io = new IntersectionObserver(
        ([e]) => {
          // Hidden once the title's bottom has passed under the nav.
          setShow(!e.isIntersecting && e.boundingClientRect.bottom < navBottom() + 4);
        },
        { rootMargin: `-${navBottom()}px 0px 0px 0px`, threshold: 0 },
      );
      io.observe(title);
    };

    attach();
    const mo = new MutationObserver(() => {
      if (!raf) raf = requestAnimationFrame(attach);
    });
    mo.observe(main, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-compact"] });
    return () => {
      mo.disconnect();
      io?.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [pathname]);

  // Reflect state on the nav so CSS can hand the wordmark over to the title.
  useEffect(() => {
    const nav = el.current?.closest(".nav") as HTMLElement | null;
    if (!nav) return;
    if (show && text) nav.dataset.compact = "";
    else delete nav.dataset.compact;
    return () => {
      delete nav.dataset.compact;
    };
  }, [show, text]);

  // Measure the free space in the nav for the title.
  useLayoutEffect(() => {
    const nav = el.current?.closest(".nav") as HTMLElement | null;
    if (!nav) return;
    const measure = () => {
      const nb = nav.getBoundingClientRect();
      const mark = nav.querySelector(".brand-mark")?.getBoundingClientRect();
      const links = nav.querySelector(".nav-links") as HTMLElement | null;
      const actions = nav.querySelector(".nav-actions")?.getBoundingClientRect();
      if (!mark || !actions) return;
      const rtl = getComputedStyle(nav).direction === "rtl";
      const linksVisible = !!links && links.offsetParent !== null;
      const lr = linksVisible ? links!.getBoundingClientRect() : null;
      if (!rtl) {
        const start = mark.right - nb.left + 10;
        const end = (lr ? lr.left : actions.left) - nb.left - 12;
        setBox({ left: start, width: Math.max(0, end - start), center: !lr });
      } else {
        const start = (lr ? lr.right : actions.right) - nb.left + 12;
        const end = mark.left - nb.left - 10;
        setBox({ left: start, width: Math.max(0, end - start), center: !lr });
      }
    };
    measure();
    // Web fonts change text metrics once they load.
    let alive = true;
    void document.fonts?.ready.then(() => alive && setFontsReady(true));
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    window.addEventListener("resize", measure);
    return () => {
      alive = false;
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Phones: centre on the bar when the text fits, else slide it into the free space.
  const span = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>();
  useLayoutEffect(() => {
    if (!box) return;
    if (!box.center) {
      setStyle({ left: box.left, width: box.width });
      return;
    }
    const nav = el.current?.closest(".nav") as HTMLElement | null;
    const navW = nav?.getBoundingClientRect().width ?? 0;
    // scrollWidth = the text's natural width even while the box is narrower.
    const w = span.current?.scrollWidth ?? box.width;
    const centre = navW / 2;
    const half = Math.min(centre - box.left, box.left + box.width - centre);
    // Fits (with slack for font-metric changes): a region symmetric about the bar's
    // centre, centred by CSS — exact whatever the final font. Otherwise fill the free space.
    if (half > 0 && w + 12 <= half * 2) setStyle({ left: centre - half, width: half * 2, textAlign: "center" });
    else setStyle({ left: box.left, width: box.width, textAlign: "center" });
  }, [box, text, fontsReady]);

  return (
    <div ref={el} className={`ix-navtitle${show && text ? " show" : ""}${box?.center ? " centred" : ""}`} style={style} aria-hidden>
      <span ref={span}>{text}</span>
    </div>
  );
}
