import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { skeletonWidth } from "./skeletonWidth";
import "./skeleton.css";

/** A load shorter than this shows nothing and says nothing: it stays in step
 *  with the fade-in delay of `skeleton.css`. */
export const SKELETON_DELAY_MS = 200;

/** A skeleton that follows another this closely continues the same wait: a
 *  screen that loads in steps (project, plan, form) must not blink between
 *  them nor say «Cargando…» at each one. */
const SAME_WAIT_MS = 300;
let lastRegionEnd = Number.NEGATIVE_INFINITY;

/**
 * One decorative placeholder shape (SPEC §9). It takes its space at once and
 * fades in after `SKELETON_DELAY_MS`, so a fast load never flashes it. It says
 * nothing to assistive technology: the loading state is announced apart, by
 * `SkeletonRegion` or `LoadingStatus`.
 */
export function Skeleton({
  width,
  height,
  shape = "text",
  className = "",
}: {
  width?: number | string;
  height?: number | string;
  shape?: "text" | "block" | "circle";
  className?: string;
}) {
  const style: CSSProperties = { width, height };
  return <span className={`sk ${className}`.trim()} data-shape={shape} style={style} aria-hidden="true" />;
}

/**
 * The polite «Cargando…», said once and only if the load lasts. The live region
 * exists from the start and its text arrives after the delay, which is what
 * screen readers announce reliably. It is a sibling of the shapes, not inside
 * an `aria-busy` element, which would silence it.
 */
export function LoadingStatus({ active = true, label }: { active?: boolean; label?: string }) {
  const { t } = useTranslation();
  const [due, setDue] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setDue(true), SKELETON_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setDue(false);
    };
  }, [active]);
  return (
    <span className="sr-only" role="status">
      {active && due ? (label ?? t("common.loading")) : ""}
    </span>
  );
}

/**
 * The loading state of a screen or card: its shapes hidden from assistive
 * technology, plus one `LoadingStatus`. `announce={false}` when the screen
 * already says it elsewhere (Inicio has a single status for all its cards).
 */
export function SkeletonRegion({
  children,
  className = "",
  label,
  announce = true,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
  announce?: boolean;
}) {
  const [continues] = useState(() => performance.now() - lastRegionEnd < SAME_WAIT_MS);
  useEffect(
    () => () => {
      lastRegionEnd = performance.now();
    },
    [],
  );
  return (
    <div
      className={`sk-region ${className}`.trim()}
      data-testid="skeleton"
      data-continues={continues || undefined}
    >
      {announce && <LoadingStatus active={!continues} label={label} />}
      <div className="sk-region__shapes" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

/** Rows of a list on a card: an icon-sized mark, a title and its meta line. */
export function ListSkeleton({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <SkeletonRegion className={`sk-list ${className}`.trim()}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk-list__row">
          <Skeleton shape="block" width={20} height={20} />
          <div className="sk-stack">
            <Skeleton width={skeletonWidth(i)} />
            <Skeleton width={skeletonWidth(i + 3)} height={10} />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** Cards of a grid; `className` is the screen's own grid, so the tracks match. */
export function CardGridSkeleton({
  cards = 3,
  className,
  minHeight,
  announce,
}: {
  cards?: number;
  className: string;
  minHeight?: number;
  announce?: boolean;
}) {
  return (
    <SkeletonRegion className={className} announce={announce}>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="sk-card" style={{ minHeight }}>
          <Skeleton shape="block" width={36} height={36} />
          <div className="sk-stack sk-stack--grow">
            <Skeleton width={skeletonWidth(i)} height={14} />
            <Skeleton width="92%" height={10} />
          </div>
          <Skeleton shape="block" width="40%" height={22} />
        </div>
      ))}
    </SkeletonRegion>
  );
}

/** A detail or form screen: its title, and blocks of label and field. */
export function FormSkeleton({ fields = 5, className = "" }: { fields?: number; className?: string }) {
  return (
    <SkeletonRegion className={`sk-form ${className}`.trim()}>
      <Skeleton width="min(320px, 70%)" height={22} />
      <div className="sk-form__card">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="sk-stack">
            <Skeleton width={120} height={10} />
            <Skeleton shape="block" height={i % 3 === 2 ? 76 : 36} />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}
