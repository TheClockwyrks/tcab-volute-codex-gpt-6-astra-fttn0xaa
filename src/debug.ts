import * as C from "./constants";
import {
  angle,
  danger,
  feedSpeed,
  fire,
  location,
  partition,
  reset,
  startLevel,
} from "./simulation";
import type { State } from "./simulation";
import type { VoluteDebugApi } from "./game";
function number(
  n: number,
  min = -Infinity,
  max = Infinity,
  integer = false,
): number {
  if (
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer && !Number.isInteger(n))
  )
    throw new RangeError(`Invalid number: ${n}`);
  return n;
}
function member<T>(value: T, values: readonly T[]): T {
  if (!values.includes(value))
    throw new RangeError(`Unknown value: ${String(value)}`);
  return value;
}
function boolean(value: boolean): boolean {
  if (typeof value !== "boolean") throw new TypeError("Expected boolean");
  return value;
}
function reconciledSegments(s: State) {
  const holds = s.segments.flatMap((segment) =>
    Array<number>(segment.count).fill(segment.hold),
  );
  let offset = 0;
  return partition(s.cores).map((group) => {
    const hold = holds[offset] ?? 0;
    offset += group.length;
    return { count: group.length, hold };
  });
}
export function snapshot(s: State) {
  let segment = -1;
  return {
    version: C.VOLUTE_DEBUG_VERSION,
    screen: s.screen,
    score: s.score,
    level: s.level,
    cells: s.cells,
    quotaRemaining: s.quotaRemaining,
    emitted: C.LEVELS[s.level - 1].quota - s.quotaRemaining,
    pressure: s.pressure,
    feedSpeed: feedSpeed(s),
    chainStep: s.chainStep,
    chainTimer: s.chainTimer,
    interlude: s.interlude,
    danger: danger(s),
    train: partition(s.cores).flatMap((g) => {
      segment++;
      return g.map((c) => {
        const { x, y } = location(c.s);
        return { ...c, x, y, segment };
      });
    }),
    segments: reconciledSegments(s),
    injector: {
      aim: s.aim,
      cooldown: s.fireCooldown,
      loaded: s.loaded,
      queued: s.queued,
    },
    projectiles: s.projectiles.map((p) => ({ ...p })),
    machinery: s.machinery ? { ...s.machinery } : null,
    emission: s.emission,
    feed: s.feed,
    nextEmitted: s.nextEmitted,
    muted: s.muted,
    simTime: s.simTime,
  };
}
export const debug: VoluteDebugApi = {
  version: C.VOLUTE_DEBUG_VERSION,
  reset,
  snapshot,
  reconcile: (s) => ({ ...s, segments: reconciledSegments(s) }),
  setScreen: (s, screen) => ({ ...s, screen: member(screen, C.SCREENS) }),
  setLevel: (s, level) => ({
    ...s,
    level: number(level, 1, C.LEVEL_COUNT, true),
  }),
  setScore: (s, score) => ({ ...s, score: number(score, 0, Infinity, true) }),
  setCells: (s, cells) => ({ ...s, cells: number(cells, 0, C.CELLS, true) }),
  setChainStep: (s, chainStep) => ({
    ...s,
    chainStep: number(chainStep, 1, Infinity, true),
    chainTimer: C.CHAIN_RESET,
  }),
  startLevel: (s, level) =>
    startLevel(s, number(level, 1, C.LEVEL_COUNT, true)),
  poseTrain: (s, triples) => {
    const cores = triples
      .map(([at, charge, mark]) => ({
        s: number(at, -Infinity, C.PATH_LENGTH),
        charge: member(charge, C.CHARGE_IDS),
        mark: member(mark, [...C.MACHINERY_KINDS, null]),
      }))
      .sort((a, b) => b.s - a.s);
    return {
      ...s,
      cores,
      segments: partition(cores).map((g) => ({ count: g.length, hold: 0 })),
    };
  },
  clearTrain: (s) => ({ ...s, cores: [], segments: [], projectiles: [] }),
  setLoaded: (s, loaded) => ({ ...s, loaded: member(loaded, C.CHARGE_IDS) }),
  setQueued: (s, queued) => ({ ...s, queued: member(queued, C.CHARGE_IDS) }),
  setAim: (s, aim) => ({ ...s, aim: angle(number(aim)) }),
  fire,
  setPressure: (s, pressure) => ({
    ...s,
    pressure: number(pressure, C.PRESSURE_MIN, C.PRESSURE_MAX),
  }),
  setQuotaRemaining: (s, quotaRemaining) => ({
    ...s,
    quotaRemaining: number(quotaRemaining, 0, Infinity, true),
  }),
  setEmission: (s, emission) => ({ ...s, emission: boolean(emission) }),
  setFeed: (s, feed) => ({ ...s, feed: boolean(feed) }),
  setNextEmitted: (s, nextEmitted) => ({
    ...s,
    nextEmitted: member(nextEmitted, [...C.CHARGE_IDS, null]),
  }),
  grantMachinery: (s, kind) => ({
    ...s,
    machinery: {
      kind: member(kind, ["choke", "backflow", "sightline"]),
      remaining: C.MACHINERY_DURATIONS[kind],
    },
  }),
  pause: (s) => ({ ...s, screen: "paused" }),
  resume: (s) => ({ ...s, screen: "playing" }),
};
