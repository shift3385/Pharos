import type { ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { MenuItem, ResponsiveMenu } from "./Menu";
import { usePopover } from "./usePopover";
import { useBreakpoint } from "./useBreakpoint";
import { pageWindow } from "./pageWindow";
import "./dataTable.css";

/**
 * Pagination under a table: «Mostrando 1–10 de 240», ‹ 1 2 3 … 24 › and,
 * with `pageSizes`, a «Por página» menu. On mobile (or `compact`) the pages
 * become ‹ Página 2 de 24 ›.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizes,
  onPageSizeChange,
  summary,
  compact,
  className = "",
}: {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Choices of the «Por página» menu (e.g. 12/24/48); hidden without them. */
  pageSizes?: number[];
  onPageSizeChange?: (size: number) => void;
  /** Replaces «Mostrando 1–10 de 240» (e.g. to say «casos»). */
  summary?: (range: { from: number; to: number; total: number }) => ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const mobile = useBreakpoint() === "mobile";
  const sizeMenu = usePopover(mobile ? "dialog" : "menu");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(page, 1), pages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const isCompact = compact ?? mobile;

  const go = (p: number) => {
    if (p >= 1 && p <= pages && p !== current) onPageChange(p);
  };
  const arrow = (dir: "prev" | "next") => {
    const target = dir === "prev" ? current - 1 : current + 1;
    const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
    const name = t(`table.pagination.${dir}`);
    return (
      <button
        type="button"
        className="pg__btn"
        aria-label={name}
        title={name}
        disabled={target < 1 || target > pages}
        onClick={() => go(target)}
      >
        <Icon size={15} aria-hidden="true" />
      </button>
    );
  };

  return (
    <div className={`pg ${className}`.trim()}>
      <span className="pg__summary" aria-live="polite">
        {summary ? (
          summary({ from, to, total })
        ) : (
          <Trans
            i18nKey="table.pagination.summary"
            values={{ from, to, total }}
            components={{ b: <b /> }}
          />
        )}
      </span>
      {pageSizes && onPageSizeChange && (
        <>
          <button type="button" className="pg__size" {...sizeMenu.triggerProps}>
            {t("table.pagination.perPageValue", { count: pageSize })}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          <ResponsiveMenu
            open={sizeMenu.open}
            onClose={sizeMenu.close}
            anchorRef={sizeMenu.anchorRef}
            id={sizeMenu.id}
            label={t("table.pagination.perPage")}
            title={t("table.pagination.perPage")}
            className="pg__size-menu"
          >
            {pageSizes.map((n) => (
              <MenuItem key={n} selected={n === pageSize} onSelect={() => onPageSizeChange(n)}>
                {t("table.pagination.perPageValue", { count: n })}
              </MenuItem>
            ))}
          </ResponsiveMenu>
        </>
      )}
      <span className="pg__spacer" />
      {pages > 1 && (
        <nav className="pg__pages" aria-label={t("table.pagination.label")}>
          {arrow("prev")}
          {isCompact ? (
            <span className="pg__compact">{t("table.pagination.compact", { page: current, pages })}</span>
          ) : (
            pageWindow(current, pages).map((n, i) =>
              n === "…" ? (
                <span key={`gap-${i}`} className="pg__gap" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  className="pg__btn"
                  aria-current={n === current ? "page" : undefined}
                  onClick={() => go(n)}
                >
                  <span className="sr-only">{t("table.pagination.pagePrefix")} </span>
                  {n}
                </button>
              ),
            )
          )}
          {arrow("next")}
        </nav>
      )}
    </div>
  );
}
