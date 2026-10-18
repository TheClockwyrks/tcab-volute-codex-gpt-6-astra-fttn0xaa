import * as C from "./constants";
import type { CoreState, VoluteState } from "./game";
import type { DeepReadonly } from "ts-essentials";
export type State = DeepReadonly<VoluteState>;
export const angle = (n: number) => ((n % 360) + 360) % 360;
export const radians = (n: number) => (n * Math.PI) / 180;
export const clamp = (n: number, lo = C.PRESSURE_MIN, hi = C.PRESSURE_MAX) =>
  Math.max(lo, Math.min(hi, n));
export function location(s: number) {
  let remaining = Math.max(0, s);
  for (let i = 0; i < C.CHANNEL.length - 1; i++) {
    const a = C.CHANNEL[i],
      b = C.CHANNEL[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const dx = (b.x - a.x) / length,
      dy = (b.y - a.y) / length;
    if (remaining < length || i === C.CHANNEL.length - 2)
      return { x: a.x + dx * remaining, y: a.y + dy * remaining, dx, dy };
    remaining -= length;
  }
  throw new Error("Channel has no legs");
}
export const touching = (a: number, b: number) =>
  Math.abs(a - b - C.SPACING) < 1e-7;
export function partition<T extends CoreState>(cores: readonly T[]): T[][] {
  const groups: T[][] = [];
  for (const core of cores) {
    const last = groups[groups.length - 1];
    if (last && touching(last[last.length - 1].s, core.s)) last.push(core);
    else groups.push([core]);
  }
  return groups;
}
export const danger = (s: State) => (s.cores[0]?.s ?? -Infinity) >= C.DANGER_S;
export const feedSpeed = (s: State) =>
  C.LEVELS[s.level - 1].feedSpeed *
  (1 + s.pressure / C.PRESSURE_MAX) *
  (s.machinery?.kind === "choke" ? C.CHOKE_FEED_MULTIPLIER : 1);
export function reset(s?: State): VoluteState {
  return {
    visuals: [],
    screen: "title",
    score: 0,
    level: 1,
    cells: C.CELLS,
    quotaRemaining: C.LEVELS[0].quota,
    pressure: C.PRESSURE_MIN,
    chainStep: 1,
    chainTimer: 0,
    machinery: null,
    cores: [],
    segments: [],
    projectiles: [],
    loaded: null,
    queued: null,
    aim: C.AIM_START,
    fireCooldown: 0,
    interlude: 0,
    simTime: 0,
    accumulator: 0,
    emission: s?.emission ?? true,
    feed: s?.feed ?? true,
    nextEmitted: null,
    muted: s?.muted ?? false,
  };
}
export function drawCharge(s: State): C.ChargeId {
  const choices = s.cores.length
    ? [...new Set(s.cores.map((c) => c.charge))]
    : C.LEVELS[s.level - 1].charges;
  return choices[Math.floor(Math.random() * choices.length)];
}
function markAt(n: number): C.MachineryKind | null {
  return n > 0 && n % C.MARK_INTERVAL === 0
    ? C.MACHINERY_KINDS[(n / C.MARK_INTERVAL - 1) % C.MACHINERY_KINDS.length]
    : null;
}
export function startLevel(s: State, level: number): VoluteState {
  const row = C.LEVELS[level - 1];
  const cores = Array.from({ length: C.SEEDED_CORES }, (_, i) => ({
    s: C.SEEDED_HEAD_S - i * C.SPACING,
    charge: row.charges[Math.floor(Math.random() * row.charges.length)],
    mark: markAt(i + 1),
  }));
  const next: VoluteState = {
    ...s,
    visuals: [],
    screen: "playing",
    level,
    cores,
    segments: [{ count: cores.length, hold: 0 }],
    quotaRemaining: row.quota - C.SEEDED_CORES,
    pressure: 0,
    chainStep: 1,
    chainTimer: 0,
    machinery: null,
    projectiles: [],
    fireCooldown: 0,
    interlude: 0,
    accumulator: 0,
  };
  return { ...next, loaded: drawCharge(next), queued: drawCharge(next) };
}
export function fire(s: State): VoluteState {
  return {
    ...s,
    projectiles: [
      ...s.projectiles,
      {
        x: C.INJECTOR_X,
        y: C.INJECTOR_Y,
        angle: s.aim,
        charge: s.loaded ?? drawCharge(s),
      },
    ],
    loaded: s.queued ?? drawCharge(s),
    queued: drawCharge(s),
    fireCooldown: C.FIRE_COOLDOWN,
  };
}
interface WorkingCore {
  s: number;
  charge: C.ChargeId;
  mark: C.MachineryKind | null;
  hold: number;
}
/** A tick works on isolated copies; no object reachable from its input is written. */
export function tick(
  input: State,
  cue: (name: C.CueName) => void,
): VoluteState {
  const dt = C.TICK_DT;
  input = {
    ...input,
    visuals: input.visuals
      .map((v) => ({ ...v, age: v.age + dt }))
      .filter((v) => v.age < 0.85),
  };
  if (input.screen === "cleared" || input.screen === "setback") {
    const interlude = Math.max(0, input.interlude - dt);
    return interlude < 1e-9
      ? startLevel(input, input.level + (input.screen === "cleared" ? 1 : 0))
      : { ...input, interlude };
  }
  if (input.screen !== "playing") return { ...input };
  let s: VoluteState = {
    ...input,
    fireCooldown: Math.max(0, input.fireCooldown - dt),
    chainTimer: Math.max(0, input.chainTimer - dt),
    machinery:
      input.machinery && input.machinery.remaining > dt + 1e-9
        ? { ...input.machinery, remaining: input.machinery.remaining - dt }
        : null,
  };
  if (s.chainTimer < 1e-9) s = { ...s, chainStep: 1, chainTimer: 0 };
  let offset = 0;
  let cores: WorkingCore[] = input.segments.flatMap((segment) =>
    input.cores
      .slice(offset, (offset += segment.count))
      .map((c) => ({ ...c, hold: Math.max(0, segment.hold - dt) })),
  );
  const grants: WorkingCore[] = [];
  function remove(victims: WorkingCore[], extraction: boolean, step: number) {
    if (!victims.length) return;
    const front = Math.max(...victims.map((c) => c.s));
    cores = cores.filter((c) => !victims.includes(c));
    const groups = partition(cores);
    const shifts = groups.map((g, i) =>
      g[0].s < front
        ? clamp(
            Math.min(
              g[g.length - 1].s,
              groups[i + 1]
                ? g[g.length - 1].s - groups[i + 1][0].s - C.SPACING
                : C.RECOIL,
            ),
            0,
            C.RECOIL,
          )
        : 0,
    );
    groups.forEach((g, i) => {
      if (g[0].s < front)
        for (const c of g) {
          c.s -= shifts[i];
          c.hold = C.RECOIL_HOLD;
        }
    });
    for (const g of partition(cores)) for (const c of g) c.hold = g[0].hold;
    s = {
      ...s,
      score: s.score + C.SCORE_PER_CORE * victims.length * step,
      pressure: clamp(s.pressure - victims.length * C.PRESSURE_DROP_PER_CORE),
    };
    if (extraction) {
      s = {
        ...s,
        visuals: [
          ...s.visuals,
          ...victims.flatMap((c, i) => {
            const { x, y } = location(c.s);
            const base = {
              x,
              y,
              charge: c.charge,
              age: 0,
              seed: Math.floor(s.simTime * 1000) + i * 71,
            };
            return [
              { ...base, kind: "burst" as const },
              ...(c.mark ? [{ ...base, kind: "pickup" as const }] : []),
            ];
          }),
        ],
      };
      s = { ...s, chainStep: step, chainTimer: C.CHAIN_RESET };
      cue(C.EXTRACT_CUES[Math.min(step, C.EXTRACT_CUES.length) - 1]);
      grants.push(...victims.filter((c) => c.mark));
    }
  }
  function match(core: WorkingCore, step: number) {
    const group = partition(cores).find((g) => g.includes(core));
    if (!group) return;
    let a = group.indexOf(core),
      b = a;
    while (a > 0 && group[a - 1].charge === core.charge) a--;
    while (b + 1 < group.length && group[b + 1].charge === core.charge) b++;
    if (b - a + 1 >= C.MIN_RUN) remove(group.slice(a, b + 1), true, step);
  }
  if (s.feed) {
    if (s.machinery?.kind === "backflow") {
      for (let i = cores.length - 1; i >= 0; i--) {
        const c = cores[i];
        if (c.s >= 0)
          c.s = Math.max(
            cores[i + 1] ? cores[i + 1].s + C.SPACING : 0,
            c.s - C.BACKFLOW_SPEED * dt,
          );
      }
    } else {
      const initialGroups = partition(cores);
      for (const original of initialGroups) {
        const survivors = original.filter((c) => cores.includes(c));
        if (!survivors.length) continue;
        // A prior extraction can split this original group into several groups.
        for (const g of partition(survivors)) {
          const index = cores.indexOf(g[0]);
          const ahead = cores[index - 1];
          const distance =
            g[0].hold > 1e-9
              ? 0
              : (index === 0 ? feedSpeed(s) : C.CATCHUP_SPEED) * dt;
          const move = ahead
            ? Math.min(distance, ahead.s - C.SPACING - g[0].s)
            : distance;
          for (const c of g) c.s += move;
          if (ahead && touching(ahead.s, g[0].s)) {
            for (const c of g) c.hold = ahead.hold;
            if (ahead.charge === g[0].charge) match(g[0], s.chainStep + 1);
          }
        }
      }
    }
  }
  const projectiles = [];
  for (const p of s.projectiles) {
    const a = radians(p.angle),
      x = p.x + Math.cos(a) * C.PROJECTILE_SPEED * dt,
      y = p.y + Math.sin(a) * C.PROJECTILE_SPEED * dt;
    if (x < 0 || x > C.FIELD_W || y < 0 || y > C.FIELD_H) continue;
    let target: WorkingCore | undefined,
      best = C.STRIKE_DISTANCE;
    for (const c of cores) {
      const point = location(c.s),
        d = Math.hypot(x - point.x, y - point.y);
      if (d <= best && (!target || d < best || c.s > target.s)) {
        target = c;
        best = d;
      }
    }
    if (!target) {
      projectiles.push({ ...p, x, y });
      continue;
    }
    const pos = location(target.s);
    const at =
      target.s -
      ((x - pos.x) * pos.dx + (y - pos.y) * pos.dy > 0 ? 0 : C.SPACING);
    for (const c of cores) if (c.s <= at) c.s -= C.SPACING;
    const inserted: WorkingCore = {
      s: at,
      charge: p.charge,
      mark: null,
      hold: target.hold,
    };
    cores.push(inserted);
    cores.sort((a, b) => b.s - a.s);
    cue(C.CUES.seat);
    match(inserted, 1);
  }
  for (const c of grants) {
    cue(C.CUES.machinery);
    if (c.mark === "bore") {
      const at = location(c.s);
      s = {
        ...s,
        visuals: [
          ...s.visuals,
          {
            kind: "bore",
            x: at.x,
            y: at.y,
            age: 0,
            charge: null,
            seed: Math.floor(s.simTime * 1000),
          },
        ],
      };
      remove(
        cores.filter((other) => {
          const p = location(other.s);
          return Math.hypot(p.x - at.x, p.y - at.y) <= C.BORE_RADIUS;
        }),
        false,
        s.chainStep,
      );
    } else if (c.mark)
      s = {
        ...s,
        machinery: { kind: c.mark, remaining: C.MACHINERY_DURATIONS[c.mark] },
      };
  }
  s = {
    ...s,
    pressure: clamp(
      s.pressure +
        (cores.length > C.PRESSURE_FREE
          ? (cores.length - C.PRESSURE_FREE) * C.PRESSURE_RISE_PER_CORE
          : -C.PRESSURE_BLEED) *
          dt,
    ),
    projectiles,
  };
  if ((cores[0]?.s ?? 0) >= C.INTAKE_S) {
    cue(C.CUES.intake);
    cue(C.CUES.cellLost);
    const cells = Math.max(0, s.cells - 1);
    const at = location(C.INTAKE_S);
    s = {
      ...s,
      visuals: [
        ...s.visuals,
        {
          kind: "swallow",
          x: at.x,
          y: at.y,
          charge: null,
          age: 0,
          seed: Math.floor(s.simTime * 1000),
        },
      ],
    };
    return {
      ...s,
      cells,
      screen: cells ? "setback" : "gameover",
      interlude: cells ? C.INTERLUDE : 0,
      cores: [],
      segments: [],
      projectiles: [],
      pressure: 0,
      machinery: null,
      chainStep: 1,
      chainTimer: 0,
      quotaRemaining: C.LEVELS[s.level - 1].quota - C.SEEDED_CORES,
    };
  }
  if (!cores.length && s.quotaRemaining === 0) {
    cue(C.CUES.levelClear);
    return {
      ...s,
      cores: [],
      segments: [],
      score: s.score + C.CLEAR_SCORE,
      screen: s.level === C.LEVEL_COUNT ? "victory" : "cleared",
      interlude: s.level === C.LEVEL_COUNT ? 0 : C.INTERLUDE,
    };
  }
  if (
    s.emission &&
    s.machinery?.kind !== "backflow" &&
    s.quotaRemaining > 0 &&
    (!cores.length || cores[cores.length - 1].s >= C.SPACING)
  ) {
    const charge = s.nextEmitted ?? drawCharge({ ...s, cores });
    cores.push({
      s: 0,
      charge,
      mark: markAt(C.LEVELS[s.level - 1].quota - s.quotaRemaining + 1),
      hold: 0,
    });
    s = { ...s, quotaRemaining: s.quotaRemaining - 1, nextEmitted: null };
  }
  const segments = partition(cores).map((g) => ({
    count: g.length,
    hold: g[0].hold,
  }));
  return {
    ...s,
    cores: cores.map(({ s, charge, mark }) => ({ s, charge, mark })),
    segments,
  };
}
