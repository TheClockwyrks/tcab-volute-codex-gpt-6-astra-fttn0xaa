import type { ChargeId, MachineryKind, ScreenName } from "./constants";

export type { ChargeId, MachineryKind, ScreenName };

export interface CoreState {
  readonly charge: ChargeId;
  readonly s: number;
  readonly mark: MachineryKind | null;
}

export interface SegmentState {
  readonly count: number;
  readonly hold: number;
}

export interface ProjectileState {
  readonly charge: ChargeId;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export interface MachineryState {
  readonly kind: MachineryKind;
  readonly remaining: number;
}

export interface VisualEvent {
  readonly kind: "burst" | "bore" | "swallow" | "pickup";
  readonly x: number;
  readonly y: number;
  readonly charge: ChargeId | null;
  readonly age: number;
  readonly seed: number;
}

export interface VoluteState {
  /** Presentation history derived exclusively from simulation events. */
  readonly visuals: readonly VisualEvent[];
  readonly screen: ScreenName;

  readonly score: number;
  readonly level: number;
  readonly cells: number;
  readonly quotaRemaining: number;

  readonly pressure: number;
  readonly chainStep: number;
  readonly chainTimer: number;
  readonly machinery: MachineryState | null;

  readonly cores: readonly CoreState[];
  readonly segments: readonly SegmentState[];
  readonly projectiles: readonly ProjectileState[];

  readonly loaded: ChargeId | null;
  readonly queued: ChargeId | null;
  readonly aim: number;
  readonly fireCooldown: number;

  readonly interlude: number;
  readonly simTime: number;
  readonly accumulator: number;
  readonly emission: boolean;
  readonly feed: boolean;
  readonly nextEmitted: ChargeId | null;
  readonly muted: boolean;
}

import type { DeepReadonly } from "ts-essentials";
import type { Game } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { debug, snapshot } from "./debug";
import {
  angle,
  danger,
  fire,
  radians,
  reset,
  startLevel,
  tick,
} from "./simulation";
import { loadArt, render } from "./presentation";
export const BACKGROUND = "#0b161a";
export interface VoluteDebugApi {
  readonly version: number;
  reset(state: DeepReadonly<VoluteState>): VoluteState;
  reconcile(state: DeepReadonly<VoluteState>): VoluteState;
  snapshot(state: DeepReadonly<VoluteState>): ReturnType<typeof snapshot>;
  setScreen(state: DeepReadonly<VoluteState>, name: ScreenName): VoluteState;
  setLevel(state: DeepReadonly<VoluteState>, level: number): VoluteState;
  setScore(state: DeepReadonly<VoluteState>, n: number): VoluteState;
  setCells(state: DeepReadonly<VoluteState>, n: number): VoluteState;
  setChainStep(state: DeepReadonly<VoluteState>, k: number): VoluteState;
  startLevel(state: DeepReadonly<VoluteState>, level: number): VoluteState;
  poseTrain(
    state: DeepReadonly<VoluteState>,
    cores: readonly (readonly [number, ChargeId, MachineryKind | null])[],
  ): VoluteState;
  clearTrain(state: DeepReadonly<VoluteState>): VoluteState;
  setLoaded(state: DeepReadonly<VoluteState>, charge: ChargeId): VoluteState;
  setQueued(state: DeepReadonly<VoluteState>, charge: ChargeId): VoluteState;
  setAim(state: DeepReadonly<VoluteState>, angleDegrees: number): VoluteState;
  fire(state: DeepReadonly<VoluteState>): VoluteState;
  setPressure(state: DeepReadonly<VoluteState>, value: number): VoluteState;
  setQuotaRemaining(state: DeepReadonly<VoluteState>, n: number): VoluteState;
  setEmission(state: DeepReadonly<VoluteState>, enabled: boolean): VoluteState;
  setNextEmitted(
    state: DeepReadonly<VoluteState>,
    charge: ChargeId | null,
  ): VoluteState;
  setFeed(state: DeepReadonly<VoluteState>, enabled: boolean): VoluteState;
  grantMachinery(
    state: DeepReadonly<VoluteState>,
    kind: Exclude<MachineryKind, "bore">,
  ): VoluteState;
  pause(state: DeepReadonly<VoluteState>): VoluteState;
  resume(state: DeepReadonly<VoluteState>): VoluteState;
}
export const game: Game<VoluteState, VoluteDebugApi> = {
  async initialize(api) {
    for (const action of C.ACTIONS)
      api.input.register(action, { keys: [...C.BINDINGS[action]] });
    await Promise.all([
      loadArt(api),
      ...Object.values(C.CUES).map((cue) =>
        api.audio.load(cue, `audio/${cue}.wav`),
      ),
    ]);
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("level / score", (s) => `${s.level} / ${s.score}`);
    api.diagnostics.register("cells", (s) => s.cells);
    api.diagnostics.register("quota", (s) => s.quotaRemaining);
    api.diagnostics.register(
      "pressure / feed",
      (s) => `${s.pressure.toFixed(2)} / ${snapshot(s).feedSpeed.toFixed(2)}`,
    );
    api.diagnostics.register("chain", (s) => s.chainStep);
    api.diagnostics.register(
      "cores / head",
      (s) => `${s.cores.length} / ${s.cores[0]?.s.toFixed(2) ?? "-"}`,
    );
    api.diagnostics.register("segments", (s) => s.segments.length);
    api.diagnostics.register("danger", danger);
    api.diagnostics.register(
      "injector",
      (s) =>
        `${s.loaded} > ${s.queued} / ${s.aim.toFixed(1)} / ${s.fireCooldown.toFixed(2)}`,
    );
    api.diagnostics.register("projectiles", (s) => s.projectiles.length);
    api.diagnostics.register("machinery", (s) =>
      s.machinery
        ? `${s.machinery.kind} ${s.machinery.remaining.toFixed(1)}`
        : "none",
    );
    return [reset(), debug];
  },
  update(state, api, dt) {
    let s: VoluteState = { ...state };
    if (state.screen === "gameover" || state.screen === "victory") {
      s = {
        ...s,
        visuals: s.visuals
          .map((v) => ({ ...v, age: v.age + dt }))
          .filter((v) => v.age < 0.85),
      };
    }
    const pressed = (name: C.ActionName) => api.input.pressed(name);
    if (pressed("mute")) api.audio.setMuted(!api.audio.muted());
    const pointer = api.input.pointer();
    const click =
      api.input.pointerPressed() &&
      pointer.x >= 0 &&
      pointer.x <= C.FIELD_W &&
      pointer.y >= 0 &&
      pointer.y <= C.FIELD_H;
    if (
      state.screen === "title" ||
      state.screen === "gameover" ||
      state.screen === "victory"
    ) {
      if (pressed("confirm") || click)
        s = state.screen === "title" ? startLevel(s, 1) : reset(s);
    } else if (
      (state.screen === "playing" || state.screen === "paused") &&
      pressed("pause")
    ) {
      s = { ...s, screen: state.screen === "playing" ? "paused" : "playing" };
    } else if (state.screen === "playing") {
      const samples = api.input.pointerSamples();
      if (
        samples.some((p) => p.primary) &&
        (pointer.x !== C.INJECTOR_X || pointer.y !== C.INJECTOR_Y)
      )
        s = {
          ...s,
          aim: angle(
            Math.atan2(pointer.y - C.INJECTOR_Y, pointer.x - C.INJECTOR_X) /
              radians(1),
          ),
        };
      const ticks = Math.floor((s.accumulator + dt + 1e-10) / C.TICK_DT);
      s = {
        ...s,
        aim: angle(
          s.aim +
            (api.input.value("right") - api.input.value("left")) *
              C.AIM_TURN_RATE *
              ticks *
              C.TICK_DT,
        ),
      };
      if (pressed("b")) {
        s = { ...s, loaded: s.queued, queued: s.loaded };
        api.audio.play(C.CUES.swap);
      }
      if (pressed("a") || click) {
        if (s.fireCooldown > 1e-9) api.audio.play(C.CUES.denied);
        else {
          s = fire(s);
          api.audio.play(C.CUES.fire);
        }
      }
    }
    let accumulator = s.accumulator + dt;
    const advances = () =>
      s.screen === "playing" ||
      s.screen === "cleared" ||
      s.screen === "setback";
    if (advances()) {
      while (accumulator + 1e-10 >= C.TICK_DT && advances()) {
        const cues = new Set<C.CueName>();
        s = tick(s, (cue) => cues.add(cue));
        for (const cue of cues) api.audio.play(cue);
        accumulator = Math.max(0, accumulator - C.TICK_DT);
      }
    }
    if (!advances()) accumulator = 0;
    const bed =
      s.screen === "playing"
        ? danger(s)
          ? C.CUES.dangerLoop
          : C.CUES.hallLoop
        : null;
    for (const cue of C.LOOPING_CUES) if (cue !== bed) api.audio.stop(cue);
    if (bed) api.audio.loop(bed);
    return {
      ...s,
      accumulator,
      simTime: s.simTime + dt,
      muted: api.audio.muted(),
    };
  },
  render,
};
