/**
 * North brand marks.
 *
 * A compass rose: a broken ring, four cardinal arrowheads, and a two-tone
 * needle pointing north. Drawn as vector rather than traced from the raster
 * brand sheet, so it stays crisp from a 15px sidebar mark up to a login header
 * and an app icon.
 *
 * The geometry is parametric around a 100x100 box with the rose centred at
 * (50,50) and a ring radius of 38. The ring is four explicit arcs rather than a
 * dashed circle, because a dash pattern puts its gaps wherever the arithmetic
 * lands and these four gaps have to sit exactly under the four arrowheads.
 *
 * Colour carries the meaning: north is the bright blue, east and west are the
 * dark slate, south is grey. The needle splits down the centre line, darker on
 * the left, so it reads as a three-dimensional pointer rather than a triangle.
 */

const VIEWBOX = "0 0 100 100";

/** The four ring arcs, each spanning 58 degrees with 32-degree gaps between. */
const RING_ARCS = [
  "M86.53,60.48 A38,38 0 0 1 60.48,86.53",
  "M39.52,86.53 A38,38 0 0 1 13.47,60.48",
  "M13.47,39.52 A38,38 0 0 1 39.52,13.47",
  "M60.48,13.47 A38,38 0 0 1 86.53,39.52",
];

const NORTH_HEAD = "M50,4 L58,22 L42,22 Z";
const EAST_HEAD = "M96,50 L80,57 L80,43 Z";
const SOUTH_HEAD = "M50,96 L42,78 L58,78 Z";
const WEST_HEAD = "M4,50 L20,43 L20,57 Z";

/** The needle, split down the centre so each half can take its own blue. */
const NEEDLE_LEFT = "M50,29 L26,75 L50,62 Z";
const NEEDLE_RIGHT = "M50,29 L74,75 L50,62 Z";

/**
 * The compass rose on its own. Sized by the caller.
 *
 * `onDark` lifts the slate arrowheads to white — on a navy ground they would
 * otherwise disappear, leaving a lopsided rose with only two of its four
 * points visible.
 */
export function NorthMark({
  className,
  style,
  onDark = false,
}: {
  className?: string;
  style?: React.CSSProperties;
  onDark?: boolean;
}) {
  const slate = onDark ? "#FFFFFF" : "var(--brand-slate)";
  return (
    <svg viewBox={VIEWBOX} className={className} style={style} fill="none" aria-hidden="true">
      {RING_ARCS.map((d) => (
        <path key={d} d={d} stroke="var(--brand-grey)" strokeWidth="7" fill="none" />
      ))}
      <path d={NORTH_HEAD} fill="var(--brand-blue)" />
      <path d={EAST_HEAD} fill={slate} />
      <path d={WEST_HEAD} fill={slate} />
      <path d={SOUTH_HEAD} fill="var(--brand-grey)" />
      <path d={NEEDLE_LEFT} fill="var(--brand-blue-deep)" />
      <path d={NEEDLE_RIGHT} fill="var(--brand-blue)" />
    </svg>
  );
}

/**
 * Single-colour rose, for places that have to sit on a coloured ground.
 *
 * The ring and the south head drop to a lower opacity so the shape keeps its
 * hierarchy — north still reads as the point of it — without a second hue.
 */
export function NorthMarkMono({
  className,
  style,
  color = "currentColor",
}: {
  className?: string;
  style?: React.CSSProperties;
  color?: string;
}) {
  return (
    <svg viewBox={VIEWBOX} className={className} style={style} fill="none" aria-hidden="true">
      {RING_ARCS.map((d) => (
        <path key={d} d={d} stroke={color} strokeWidth="7" fill="none" opacity="0.5" />
      ))}
      <path d={NORTH_HEAD} fill={color} />
      <path d={EAST_HEAD} fill={color} opacity="0.72" />
      <path d={WEST_HEAD} fill={color} opacity="0.72" />
      <path d={SOUTH_HEAD} fill={color} opacity="0.5" />
      <path d={NEEDLE_LEFT} fill={color} opacity="0.72" />
      <path d={NEEDLE_RIGHT} fill={color} />
    </svg>
  );
}

/**
 * Rose plus wordmark, the primary lockup: compass on the left, North beside it.
 *
 * `size` drives everything, so the lockup keeps its proportions whether it is
 * the 15px sidebar or the 22px login header. The rose is square, so its width
 * tracks its height exactly.
 */
export function NorthLockup({
  size = 15,
  tone = "dark",
  className,
}: {
  size?: number;
  tone?: "dark" | "light";
  className?: string;
}) {
  const markSize = Math.round(size * 1.75);
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.46) }}
    >
      <NorthMark
        className="shrink-0"
        style={{ height: markSize, width: markSize }}
        onDark={tone === "light"}
      />
      <span
        style={{ fontSize: size, lineHeight: 1.1 }}
        className={`font-semibold tracking-[-0.02em] ${tone === "light" ? "text-white" : "text-brand-slate"}`}
      >
        North
      </span>
    </span>
  );
}
