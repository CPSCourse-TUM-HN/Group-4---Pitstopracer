#!/usr/bin/env python3
"""
Extract track geometry from the Monza foam blueprint.

The blueprint is a vector PDF drawn at 1:1 scale. Elements are identified by
their stroke signature rather than by position, so the script keeps working if
the layout is redrawn:

    stroke-width 720  -> track centreline (72 cm lane)
    stroke-width 520  -> pit lane         (52 cm lane)
    green fill        -> pit box

Emits app/src/track/monza.generated.ts. Run --verify in isolation to check a
revised blueprint before regenerating.

Requires pdftocairo (poppler).
"""

import argparse, math, re, subprocess, sys, tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PDF_DEFAULT = REPO / "docs/track/monza_foam_grid_simple_rolls.pdf"
OUT_DEFAULT = REPO / "app/src/track/monza.generated.ts"

PT_PER_CM = 28.3465          # 72 pt/inch / 2.54 cm/inch
TRACK_STROKE = "720"         # 72 cm lane
PIT_STROKE = "520"           # 52 cm lane
GREEN = "12.199402%, 54.098511%, 22.698975%"

# Verification bounds. The centreline must close on itself, and its length must
# stay near the measured 22.01 m -- a large change means the layout was redrawn
# and the app's distance-based logic needs revisiting, not silently updating.
EXPECT_LENGTH_CM = 2201.0
LENGTH_TOLERANCE_CM = 150.0
MAX_CLOSURE_GAP_CM = 1.0


def to_svg(pdf: Path) -> str:
    out = Path(tempfile.mkdtemp()) / "track.svg"
    try:
        subprocess.run(["pdftocairo", "-svg", str(pdf), str(out)],
                       check=True, capture_output=True)
    except FileNotFoundError:
        sys.exit("pdftocairo not found. Install poppler (brew install poppler).")
    except subprocess.CalledProcessError as e:
        sys.exit(f"pdftocairo failed: {e.stderr.decode()[:300]}")
    return out.read_text()


def attr(tag: str, key: str):
    m = re.search(key + r'="([^"]*)"', tag)
    return m.group(1) if m else None


def points_cm(tag: str):
    """Path coords -> centimetres, honouring the element's transform.

    Paths carrying matrix(a,0,0,d,e,f) are in millimetres; ones without a
    transform are already in points. Mixing the two silently yields a shape
    that is right but ~10x the wrong size, so the transform is required.
    """
    tf = attr(tag, "transform")
    if not tf:
        return None
    m = re.match(r"matrix\(([-\d.eE]+),\s*[-\d.eE]+,\s*[-\d.eE]+,\s*([-\d.eE]+)", tf)
    if not m:
        return None
    sx, sy = float(m.group(1)), float(m.group(2))
    d = attr(tag, "d") or ""
    pairs = re.findall(r"(-?\d+\.?\d*)\s+(-?\d+\.?\d*)", d)
    return [((float(x) * sx) / PT_PER_CM, (float(y) * sy) / PT_PER_CM) for x, y in pairs]


def cumulative(pts):
    cum = [0.0]
    for i in range(len(pts) - 1):
        cum.append(cum[-1] + math.dist(pts[i], pts[i + 1]))
    return cum


def nearest_index(pts, target):
    return min(range(len(pts)), key=lambda i: math.dist(pts[i], target))


CURVE_CMDS = re.compile(r"[CcSsQqTtAa]")


def parse(svg: str):
    tags = re.findall(r"<path[^>]*/?>", svg)
    track = pit = box = None
    track_tag = pit_tag = None
    for t in tags:
        sw = attr(t, "stroke-width")
        fill = attr(t, "fill") or ""
        stroke = attr(t, "stroke") or ""
        if sw == TRACK_STROKE and track is None:
            track, track_tag = points_cm(t), t
        elif sw == PIT_STROKE and pit is None:
            pit, pit_tag = points_cm(t), t
        elif box is None and sw == "80" and GREEN in (fill + stroke):
            box = points_cm(t)
    missing = [n for n, v in (("centreline", track), ("pit lane", pit), ("pit box", box)) if not v]
    if missing:
        sys.exit(f"Could not find in blueprint: {', '.join(missing)}. "
                 "Stroke signatures may have changed -- inspect the SVG.")

    # points_cm pulls every number pair out of `d`, which is only the set of
    # on-path points while the path is polyline-only. A redrawn blueprint using
    # curves would fold Bezier control points into the centreline and produce a
    # subtly wrong track that still closes and still measures ~22 m.
    curved = [name for name, t in (("centreline", track_tag), ("pit lane", pit_tag))
              if t and CURVE_CMDS.search(attr(t, "d") or "")]
    if curved:
        sys.exit(f"{', '.join(curved)} contains curve commands. The extractor "
                 "reads polylines only -- flatten the path in the source "
                 "drawing, or teach points_cm to flatten Beziers.")

    return track, pit, box


# The app renders into this viewBox (FIELD_CM below). Geometry outside it is
# silently clipped by the SVG rather than reported, so verify checks the fit.
FIELD_W_CM, FIELD_H_CM = 590, 1000


def verify(track, pit, box) -> list[str]:
    problems = []
    cum = cumulative(track)
    gap = math.dist(track[0], track[-1])
    if gap > MAX_CLOSURE_GAP_CM:
        problems.append(f"centreline does not close: {gap:.2f} cm gap (max {MAX_CLOSURE_GAP_CM})")
    if abs(cum[-1] - EXPECT_LENGTH_CM) > LENGTH_TOLERANCE_CM:
        problems.append(f"length {cum[-1]:.0f} cm differs from expected "
                        f"{EXPECT_LENGTH_CM:.0f} cm by more than {LENGTH_TOLERANCE_CM:.0f} cm")
    if any(b < a for a, b in zip(cum, cum[1:])):
        problems.append("arc-length table is not monotonic")
    if len(track) < 50:
        problems.append(f"centreline has only {len(track)} points -- too coarse")
    if len(pit) < 10:
        problems.append(f"pit lane has only {len(pit)} points -- too coarse")
    if len(box) < 4:
        problems.append("pit box is not a polygon")

    # Everything must fit the artboard, or TrackMap's viewBox clips it away
    # with no error anywhere.
    for label, pts in (("centreline", track), ("pit lane", pit), ("pit box", box)):
        oob = [(x, y) for x, y in pts
               if not (0 <= x <= FIELD_W_CM and 0 <= y <= FIELD_H_CM)]
        if oob:
            x, y = oob[0]
            problems.append(
                f"{label} leaves the {FIELD_W_CM}x{FIELD_H_CM} cm field "
                f"({len(oob)} pts, first at {x:.0f},{y:.0f}) -- it would be "
                f"clipped out of the map")

    # The pit lane must branch before it rejoins, or the twin's detour runs
    # backwards around the lap.
    entry, exit_ = nearest_index(track, pit[0]), nearest_index(track, pit[-1])
    if entry >= exit_:
        problems.append(
            f"pit lane rejoins at or before it branches (entry idx {entry}, "
            f"exit idx {exit_}) -- the lane may be drawn in reverse")

    return problems


def fmt_pts(pts, per_line=4):
    out, row = [], []
    for x, y in pts:
        row.append(f"[{x:.1f},{y:.1f}]")
        if len(row) == per_line:
            out.append("  " + ",".join(row))
            row = []
    if row:
        out.append("  " + ",".join(row))
    return ",\n".join(out)


def generate(track, pit, box, pdf: Path) -> str:
    t_cum, p_cum = cumulative(track), cumulative(pit)
    xs = [p[0] for p in box]
    ys = [p[1] for p in box]

    # Where the pit lane leaves and rejoins the racing line, as progress along
    # the centreline. The twin uses these to swap polylines during a pit stop.
    entry_i = nearest_index(track, pit[0])
    exit_i = nearest_index(track, pit[-1])

    return f'''// AUTO-GENERATED by tools/extract_track.py -- do not edit by hand.
// Source: {pdf.name}
// Regenerate: python3 tools/extract_track.py
//
// Coordinates are centimetres on the physical playing field, origin top-left,
// y increasing downward (matching both the blueprint and SVG conventions).

export interface TrackPoint {{ x: number; y: number }}

export const FIELD_CM = {{ width: 590, height: 1000 }} as const;

export const TRACK_WIDTH_CM = 72;
export const PIT_WIDTH_CM = 52;

/** Closed racing line. Last point equals the first. */
export const CENTERLINE: readonly (readonly [number, number])[] = [
{fmt_pts(track)}
];

/** Cumulative distance in cm at each CENTERLINE point. Monotonic. */
export const CENTERLINE_CUM_CM: readonly number[] = [
  {", ".join(f"{c:.1f}" for c in t_cum)}
];

export const TRACK_LENGTH_CM = {t_cum[-1]:.1f};

/** Pit lane, open: branches off the racing line and rejoins further along. */
export const PIT_LANE: readonly (readonly [number, number])[] = [
{fmt_pts(pit)}
];

export const PIT_LANE_CUM_CM: readonly number[] = [
  {", ".join(f"{c:.1f}" for c in p_cum)}
];

export const PIT_LANE_LENGTH_CM = {p_cum[-1]:.1f};

/** Progress along the centreline where the pit lane branches / rejoins. */
export const PIT_ENTRY_PROGRESS = {t_cum[entry_i] / t_cum[-1]:.4f};
export const PIT_EXIT_PROGRESS = {t_cum[exit_i] / t_cum[-1]:.4f};

/** Service bay. */
export const PIT_BOX_CM = {{
  x: {min(xs):.1f}, y: {min(ys):.1f},
  width: {max(xs) - min(xs):.1f}, height: {max(ys) - min(ys):.1f},
}} as const;

/**
 * Start/finish line, taken as the origin of the arc-length table.
 * UNVERIFIED against the blueprint's checker markings -- if the car appears
 * offset around the lap by a constant amount, correct it here.
 */
export const START_FINISH: TrackPoint = {{ x: {track[0][0]:.1f}, y: {track[0][1]:.1f} }};
'''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", type=Path, default=PDF_DEFAULT)
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    ap.add_argument("--verify", action="store_true",
                    help="check the blueprint and exit without writing")
    args = ap.parse_args()

    if not args.pdf.exists():
        sys.exit(f"Blueprint not found: {args.pdf}")

    track, pit, box = parse(to_svg(args.pdf))
    problems = verify(track, pit, box)

    cum = cumulative(track)
    print(f"centreline : {len(track):4d} pts  {cum[-1]/100:6.2f} m  "
          f"closure gap {math.dist(track[0], track[-1]):.3f} cm")
    print(f"pit lane   : {len(pit):4d} pts  {cumulative(pit)[-1]/100:6.2f} m")
    print(f"pit box    : x {min(p[0] for p in box):.0f}-{max(p[0] for p in box):.0f} cm, "
          f"y {min(p[1] for p in box):.0f}-{max(p[1] for p in box):.0f} cm")

    if problems:
        print("\nFAILED:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        sys.exit(1)
    print("verify     : OK")

    if args.verify:
        return

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(generate(track, pit, box, args.pdf))
    print(f"wrote      : {args.out.relative_to(REPO)}")


if __name__ == "__main__":
    main()
