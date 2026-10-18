/// <reference types="node" />
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { game } from "./game";
import type { VoluteState } from "./game";
import * as C from "./constants";
import { debug } from "./debug";
import { location, reset, tick } from "./simulation";
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (url: string) => new Response(await readFile(`public/${url}`)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      async decodeAudioData(bytes: ArrayBuffer) {
        expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
        return { duration: bytes.byteLength / 44100 };
      }
    },
  );
});
const engines: ReturnType<typeof createEngine<VoluteState, typeof debug>>[] =
  [];
afterEach(() => {
  for (const e of engines) e.destroy();
  engines.length = 0;
});
async function hall(render = false) {
  const target = new EventTarget();
  const engine = createEngine({
    canvas: createCanvas(C.FIELD_W, C.FIELD_H) as unknown as HTMLCanvasElement,
    width: C.FIELD_W,
    height: C.FIELD_H,
    game: render ? game : { ...game, render() {} },
    clock: new ConstantClock(C.TICK_DT * 1000),
    surface: {
      cssWidth: () => C.FIELD_W,
      cssHeight: () => C.FIELD_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  engines.push(engine);
  await engine.initialize();
  const key = (code: string, type = "keydown") =>
    target.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  const pose = (f: (s: VoluteState) => VoluteState) => engine.apply(f);
  const cues: string[] = [];
  engine.events.on("cue:played", (e) => cues.push(e.cue));
  return { engine, key, pose, cues };
}
function scenario(
  cores: readonly (readonly [number, C.ChargeId, C.MachineryKind | null])[],
): VoluteState {
  return debug.poseTrain(
    {
      ...reset(),
      screen: "playing",
      emission: false,
      feed: false,
      loaded: "halide",
      queued: "sulfur",
    },
    cores,
  );
}
const step = (s: VoluteState, n = 1) => {
  for (let i = 0; i < n; i++) s = tick(s, () => {});
  return s;
};
describe("engine integration", () => {
  it("loads committed assets, renders seven screens and exposes diagnostics", async () => {
    const { engine, pose } = await hall(true);
    expect(engine.debug.version).toBe(C.VOLUTE_DEBUG_VERSION);
    for (const screen of C.SCREENS) {
      pose((s) => debug.setScreen(s, screen));
      await engine.advance(1);
    }
    expect(engine.diagnostics().length).toBeGreaterThanOrEqual(12);
    expect(engine.diagnostics().every((d) => !d.error)).toBe(true);
  });
  it("starts, fires only on edges, denies cooldown, swaps and freezes pause", async () => {
    const { engine, key, pose, cues } = await hall();
    key("Enter");
    await engine.advance(1);
    key("Enter", "keyup");
    expect(engine.state.screen).toBe("playing");
    expect(engine.state.cores).toHaveLength(C.SEEDED_CORES);
    pose((s) => debug.setFeed(debug.setEmission(s, false), false));
    key("Space");
    await engine.advance(4);
    expect(cues.filter((c) => c === C.CUES.fire)).toHaveLength(1);
    key("Space", "keyup");
    key("Space");
    await engine.advance(1);
    expect(cues).toContain(C.CUES.denied);
    const loaded = engine.state.loaded,
      queued = engine.state.queued;
    key("KeyX");
    await engine.advance(1);
    expect(engine.state.loaded).toBe(queued);
    expect(engine.state.queued).toBe(loaded);
    key("Escape");
    await engine.advance(1);
    const paused = engine.debug.snapshot(engine.state);
    await engine.advance(120);
    expect(engine.state.screen).toBe("paused");
    expect(engine.state.projectiles).toEqual(paused.projectiles);
    expect(engine.state.fireCooldown).toBe(paused.injector.cooldown);
    key("Escape", "keyup");
    key("KeyP");
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
  });
  it("mutes globally and changes music beds with danger", async () => {
    const { engine, key, pose } = await hall();
    key("KeyM");
    await engine.advance(1);
    expect(engine.state.muted).toBe(true);
    const loops: string[] = [];
    engine.events.on("cue:looped", (e) => loops.push(e.cue));
    pose(() => ({ ...scenario([[C.DANGER_S, "cobalt", null]]), muted: true }));
    await engine.advance(1);
    pose((s) => debug.poseTrain(s, [[100, "cobalt", null]]));
    await engine.advance(1);
    expect(loops).toEqual([C.CUES.dangerLoop, C.CUES.hallLoop]);
    pose((s) => debug.reset(s));
    expect(engine.state.muted).toBe(true);
  });
  it("is invariant to frame partitions", async () => {
    const a = await hall(),
      b = await hall();
    const state = {
      ...scenario([
        [100, "sulfur", null],
        [72, "cobalt", null],
      ]),
      feed: true,
    };
    a.pose(() => state);
    b.pose(() => state);
    b.engine.setClock(new SequenceClock([5, 11, 9, 25]));
    await a.engine.advance(60);
    await b.engine.advance(80);
    expect(a.engine.state.cores[0].s).toBeCloseTo(b.engine.state.cores[0].s, 8);
    expect(b.engine.state.simTime).toBeCloseTo(1, 8);
  });
  it("renders all live particle systems", async () => {
    const { engine, pose } = await hall(true);
    pose(() => ({
      ...scenario([]),
      visuals: (["burst", "pickup", "bore", "swallow"] as const).map(
        (kind, i) => ({
          kind,
          x: 300 + i * 60,
          y: 260,
          age: 0.1,
          seed: i,
          charge: "halide" as const,
        }),
      ),
    }));
    await engine.advance(2);
    expect(engine.state.visuals).toHaveLength(4);
  });
});
describe("geometry and poses", () => {
  it("uses outgoing legs at vertices and clamps negative positions", () => {
    expect(location(-100)).toEqual({ x: 40, y: 40, dx: 1, dy: 0 });
    expect(location(880)).toEqual({ x: 920, y: 40, dx: 0, dy: 1 });
    expect(location(C.PATH_LENGTH)).toEqual({ x: 480, y: 320, dx: -1, dy: 0 });
  });
  it("sorts stably, partitions segments and reconciles without outcomes", () => {
    const s = debug.poseTrain(reset(), [
      [100, "halide", null],
      [128, "halide", "bore"],
      [100, "sulfur", null],
      [-10, "cobalt", null],
    ]);
    expect(s.cores.map((c) => c.s)).toEqual([128, 100, 100, -10]);
    expect(s.segments.map((g) => g.count)).toEqual([2, 1, 1]);
    expect(debug.reconcile(s)).toEqual(s);
    expect(debug.snapshot(s).train.map((c) => c.segment)).toEqual([0, 0, 1, 2]);
  });
  it("validates domains, permits excess quotas and normalizes headings", () => {
    const s = reset();
    for (const bad of [NaN, Infinity, -1, 1.2])
      expect(() => debug.setScore(s, bad)).toThrow();
    expect(() => debug.setLevel(s, 6)).toThrow();
    expect(() => debug.setCells(s, 4)).toThrow();
    expect(() => debug.setPressure(s, 101)).toThrow();
    expect(() => debug.setLoaded(s, "invalid" as C.ChargeId)).toThrow();
    expect(() => debug.grantMachinery(s, "bore" as "choke")).toThrow();
    expect(debug.setQuotaRemaining(s, 200).quotaRemaining).toBe(200);
    expect(debug.setAim(s, -450).aim).toBe(270);
  });
  it("preserves gates, preferences, score and aim at the specified transitions", () => {
    const s = {
      ...reset(),
      score: 100,
      aim: 45,
      emission: false,
      feed: false,
      muted: true,
    };
    const opened = debug.startLevel(s, 4);
    expect(opened.score).toBe(100);
    expect(opened.aim).toBe(45);
    expect(opened.quotaRemaining).toBe(C.LEVELS[3].quota - C.SEEDED_CORES);
    expect(opened.cores[opened.cores.length - 1].mark).toBe("choke");
    expect(debug.reset(opened)).toEqual({
      ...reset(),
      emission: false,
      feed: false,
      muted: true,
    });
    const fired = debug.fire({ ...s, screen: "paused", fireCooldown: 10 });
    expect(fired.projectiles).toHaveLength(1);
    expect(fired.fireCooldown).toBe(C.FIRE_COOLDOWN);
  });
});
describe("train and extraction", () => {
  it("never extracts pre-existing triples spontaneously", () => {
    const s = scenario([
      [200, "halide", null],
      [172, "halide", null],
      [144, "halide", null],
    ]);
    expect(step(s, 60).cores).toEqual(s.cores);
    expect(step(s).score).toBe(0);
  });
  it("inserts behind on zero dot, shifting tail below zero without moving head", () => {
    const s = {
      ...scenario([
        [28, "sulfur", null],
        [0, "cobalt", null],
      ]),
      projectiles: [
        {
          x: 68,
          y: 40 + C.PROJECTILE_SPEED * C.TICK_DT,
          angle: 270,
          charge: "halide" as const,
        },
      ],
    };
    expect(step(s).cores.map((c) => c.s)).toEqual([28, 0, -28]);
    expect(step(s).cores[1].charge).toBe("halide");
  });
  it("insertion extracts at step one, applies recoil, and leaves input untouched", () => {
    const s = {
      ...scenario([
        [300, "halide", null],
        [272, "halide", null],
        [244, "cobalt", null],
      ]),
      chainStep: 5,
      chainTimer: 1,
      pressure: 20,
      projectiles: [
        {
          x: 345,
          y: 40 + C.PROJECTILE_SPEED * C.TICK_DT,
          angle: 270,
          charge: "halide" as const,
        },
      ],
    };
    const r = step(s);
    expect(r.score).toBe(30);
    expect(r.chainStep).toBe(1);
    expect(r.cores).toHaveLength(1);
    expect(r.cores[0].s).toBe(174);
    expect(r.segments[0].hold).toBe(C.RECOIL_HOLD);
    expect(r.visuals.filter((v) => v.kind === "burst")).toHaveLength(3);
    expect(s.cores[0].s).toBe(300);
  });
  it("clamps catchup joins and increments chain on a merge", () => {
    const s = {
      ...scenario([
        [300, "halide", null],
        [272, "halide", null],
        [242, "halide", null],
        [214, "cobalt", null],
      ]),
      feed: true,
    };
    const r = step(s);
    expect(r.chainStep).toBe(2);
    expect(r.score).toBe(60);
    expect(r.cores).toHaveLength(1);
    expect(r.cores[0].s).toBeCloseTo(174 + C.LEVELS[0].feedSpeed * C.TICK_DT);
  });
  it("counts recoil hold and chain reset in simulation time", () => {
    const s = {
      ...scenario([[100, "cobalt", null]]),
      feed: true,
      segments: [{ count: 1, hold: C.RECOIL_HOLD }],
      chainStep: 4,
      chainTimer: C.CHAIN_RESET,
    };
    expect(step(s, 23).cores[0].s).toBe(100);
    expect(step(s, 24).cores[0].s).toBeGreaterThan(100);
    expect(step(s, 120).chainStep).toBe(1);
  });
  it("backflow packs tail-first and respects feed gate", () => {
    const s = debug.grantMachinery(
      {
        ...scenario([
          [100, "halide", null],
          [50, "cobalt", null],
          [0, "sulfur", null],
        ]),
        feed: true,
      },
      "backflow",
    );
    expect(step(s, 100).cores.map((c) => c.s)).toEqual([56, 28, 0]);
    expect(step({ ...s, feed: false }, 100).cores).toEqual(s.cores);
  });
  it("consumes posed emissions and cycles marks", () => {
    const s = {
      ...scenario([]),
      emission: true,
      nextEmitted: "garnet" as const,
      quotaRemaining: C.LEVELS[0].quota - 23,
    };
    const r = step(s);
    expect(r.cores[0]).toEqual({ s: 0, charge: "garnet", mark: "backflow" });
    expect(r.nextEmitted).toBeNull();
    expect(r.quotaRemaining).toBe(s.quotaRemaining - 1);
    expect(step({ ...s, emission: false }).nextEmitted).toBe("garnet");
  });
  it("raises pressure and applies choke to lead speed", () => {
    const s = {
      ...scenario(
        Array.from(
          { length: 30 },
          (_, i) => [1000 - i * C.SPACING, "halide", null] as const,
        ),
      ),
      feed: true,
      pressure: 50,
    };
    const r = step(debug.grantMachinery(s, "choke"));
    expect(r.pressure).toBeCloseTo(
      50 + 6 * C.PRESSURE_RISE_PER_CORE * C.TICK_DT,
    );
    expect(r.cores[0].s).toBeCloseTo(
      1000 + C.LEVELS[0].feedSpeed * 1.5 * C.CHOKE_FEED_MULTIPLIER * C.TICK_DT,
    );
  });
  it("grants marks in order; bore scores without granting its victims", () => {
    const s = {
      ...scenario([
        [300, "halide", "choke"],
        [272, "halide", "bore"],
        [244, "cobalt", "sightline"],
      ]),
      projectiles: [
        {
          x: 345,
          y: 40 + C.PROJECTILE_SPEED * C.TICK_DT,
          angle: 270,
          charge: "halide" as const,
        },
      ],
    };
    const r = step(s);
    expect(r.cores).toHaveLength(0);
    expect(r.score).toBe(40);
    expect(r.machinery?.kind).toBe("choke");
    expect(r.chainStep).toBe(1);
  });
  it("discards projectiles leaving the field", () => {
    const s = {
      ...scenario([]),
      projectiles: [
        { x: C.FIELD_W, y: 200, angle: 0, charge: "sulfur" as const },
      ],
    };
    expect(step(s).projectiles).toEqual([]);
  });
});
describe("progression", () => {
  it("spends one cell per tick and restarts after the full interlude", () => {
    const s = {
      ...scenario([
        [C.INTAKE_S, "cobalt", null],
        [C.INTAKE_S, "halide", null],
      ]),
      score: 230,
    };
    const r = step(s);
    expect(r.screen).toBe("setback");
    expect(r.cells).toBe(2);
    expect(r.cores).toHaveLength(0);
    expect(r.score).toBe(230);
    expect(step(r, 119).screen).toBe("setback");
    expect(step(r, 120).screen).toBe("playing");
    expect(step({ ...s, cells: 1 }).screen).toBe("gameover");
  });
  it("awards each clear and ends the last level immediately", () => {
    const s = { ...scenario([]), quotaRemaining: 0 };
    const r = step(s);
    expect(r.score).toBe(C.CLEAR_SCORE);
    expect(r.screen).toBe("cleared");
    expect(step(r, 120).level).toBe(2);
    const victory = step({ ...s, level: C.LEVEL_COUNT });
    expect(victory.screen).toBe("victory");
    expect(victory.interlude).toBe(0);
  });
});
