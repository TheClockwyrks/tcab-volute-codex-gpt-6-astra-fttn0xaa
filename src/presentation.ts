import type { InitApi, RenderApi } from "@clockwyrks/simple-2d";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import type { VoluteState, VisualEvent } from "./game";
import type { State } from "./simulation";
import { danger, location, radians } from "./simulation";

export const PALETTE: Record<C.ChargeId, string> = {
  halide: "#68efdd",
  sulfur: "#f7ca65",
  cobalt: "#809aff",
  garnet: "#ed788c",
  olivine: "#b8df77",
};
const images: Record<string, ImageBitmap> = {};
const systems: Record<string, ParticleSystem> = {};
const names = [
  ...C.CHARGE_IDS,
  ...C.MACHINERY_KINDS,
  "base",
  "barrel",
  "maw",
  "plate",
  "cell",
  "pressure",
  ...Array.from({ length: 4 }, (_, i) => `recoil-${i}`),
  ...Array.from({ length: 6 }, (_, i) => `swallow-${i}`),
  ...Array.from({ length: 6 }, (_, i) => `flash-${i}`),
];
export async function loadArt(api: InitApi<VoluteState>) {
  await Promise.all([
    ...names.map(async (name) => {
      images[name] = await api.assets.loadImage(`sprites/${name}.png`);
    }),
    ...["burst", "bore", "swallow", "pickup"].map(async (name) => {
      systems[name] = JSON.parse(
        await (await api.assets.load(`effects/${name}.json`)).text(),
      ) as ParticleSystem;
    }),
  ]);
  if (typeof OffscreenCanvas !== "undefined") {
    for (const charge of C.CHARGE_IDS)
      for (let frame = 0; frame < 6; frame++) {
        const original = images[`flash-${frame}`];
        const canvas = new OffscreenCanvas(original.width, original.height);
        const context = canvas.getContext("2d");
        if (!context) continue;
        context.drawImage(original, 0, 0);
        context.globalCompositeOperation = "source-in";
        context.fillStyle = PALETTE[charge];
        context.fillRect(0, 0, original.width, original.height);
        images[`flash-${frame}-${charge}`] = canvas.transferToImageBitmap();
      }
  }
}
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 12,
  color = "#b1c5bf",
  weight = 500,
  align: CanvasTextAlign = "left",
) {
  ctx.font = `${weight} ${size}px ${size < 14 ? "monospace" : "Arial, sans-serif"}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}
function sprite(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
) {
  const image = images[name];
  if (image)
    ctx.drawImage(
      image,
      Math.round(x - image.width / 2),
      Math.round(y - image.height / 2),
    );
}
function line(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color = "#38504e",
  width = 1,
) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = "#102126";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#3b514c";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  for (const [px, py] of [
    [x + 5, y + 5],
    [x + w - 6, y + 5],
    [x + 5, y + h - 6],
    [x + w - 6, y + h - 6],
  ]) {
    ctx.fillStyle = "#8c8568";
    ctx.fillRect(px, py, 2, 2);
  }
}
function channel(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  C.CHANNEL.forEach((p, i) =>
    i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
  );
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "#040d12";
  ctx.lineWidth = 42;
  ctx.stroke();
  ctx.strokeStyle = "#4a5b54";
  ctx.lineWidth = 36;
  ctx.stroke();
  const pattern = images.plate && ctx.createPattern(images.plate, "repeat");
  ctx.strokeStyle = pattern || "#1c3135";
  ctx.lineWidth = 32;
  ctx.stroke();
  ctx.strokeStyle = "#0a1b23";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 10]);
  ctx.stroke();
  ctx.setLineDash([]);
  // Repeated embossed direction chevrons belong to the routing chrome.
  for (let at = 400; at < C.PATH_LENGTH - 70; at += 240) {
    const p = location(at);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(p.dy, p.dx));
    line(ctx, -3, -4, 1, 0, "#40534d");
    line(ctx, 1, 0, -3, 4, "#40534d");
    ctx.restore();
  }
  text(ctx, "INLET", 40, 78, 10, "#9ea486");
  const at = location(C.INTAKE_S);
  sprite(ctx, "maw", at.x, at.y);
  text(ctx, "INTAKE", at.x, at.y + 46, 10, "#ba9470", 500, "center");
}
function background(ctx: CanvasRenderingContext2D) {
  const glow = ctx.createRadialGradient(480, 290, 40, 480, 290, 550);
  glow.addColorStop(0, "#183438");
  glow.addColorStop(1, "#091419");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  for (let y = 0; y < C.FIELD_H; y += 80)
    for (let x = 0; x < C.FIELD_W; x += 80) {
      ctx.strokeStyle = "#203235";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, 80, 80);
      ctx.fillStyle = "#314340";
      ctx.fillRect(x + 4, y + 4, 1, 1);
    }
  // Quiet service conduits and vent grilles outside the mineral channel.
  for (let i = 0; i < 7; i++)
    line(ctx, 36 + i * 6, 178, 36 + i * 6, 419, "#263c3c", 2);
  text(ctx, "V / 05", 28, 460, 10, "#60756c");
  line(ctx, 678, 454, 819, 454);
  text(ctx, "GEOTHERMAL DIVISION", 678, 474, 10, "#647c72");
}
function injector(ctx: CanvasRenderingContext2D, s: State) {
  const a = radians(s.aim);
  ctx.save();
  ctx.translate(C.INJECTOR_X, C.INJECTOR_Y);
  ctx.beginPath();
  ctx.arc(0, 0, 32, 0, Math.PI * 2);
  ctx.strokeStyle = "#5e7365";
  ctx.lineWidth = 1;
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const t = (i * Math.PI) / 6;
    line(
      ctx,
      Math.cos(t) * 30,
      Math.sin(t) * 30,
      Math.cos(t) * 34,
      Math.sin(t) * 34,
      "#8b8867",
    );
  }
  ctx.restore();
  if (s.machinery?.kind === "sightline") {
    let length = 0;
    while (length < 1200) {
      const x = C.INJECTOR_X + Math.cos(a) * length,
        y = C.INJECTOR_Y + Math.sin(a) * length;
      if (
        x < 0 ||
        x > C.FIELD_W ||
        y < 0 ||
        y > C.FIELD_H ||
        s.cores.some((c) => {
          const p = location(c.s);
          return Math.hypot(x - p.x, y - p.y) <= C.CORE_RADIUS;
        })
      )
        break;
      length++;
    }
    ctx.setLineDash([6, 5]);
    line(
      ctx,
      C.INJECTOR_X,
      C.INJECTOR_Y,
      C.INJECTOR_X + Math.cos(a) * length,
      C.INJECTOR_Y + Math.sin(a) * length,
      "#e7df9f",
    );
    ctx.setLineDash([]);
  }
  sprite(ctx, "base", C.INJECTOR_X, C.INJECTOR_Y);
  ctx.save();
  ctx.translate(C.INJECTOR_X, C.INJECTOR_Y);
  ctx.rotate(a);
  const frame = Math.min(
    3,
    Math.floor((1 - s.fireCooldown / C.FIRE_COOLDOWN) * 4),
  );
  sprite(ctx, s.fireCooldown > 0 ? `recoil-${frame}` : "barrel", 16, 0);
  ctx.restore();
  if (s.loaded) sprite(ctx, s.loaded, C.INJECTOR_X, C.INJECTOR_Y);
}
function hud(ctx: CanvasRenderingContext2D, s: State) {
  text(ctx, C.TITLE_TEXT, 146, 85, 20, "#e8d7af", 800);
  text(
    ctx,
    "PUMP HALL / " + String(s.level).padStart(2, "0"),
    290,
    83,
    11,
    "#b3c2b3",
  );
  text(ctx, "SCORE", 488, 78, 9, "#789287");
  text(ctx, String(s.score).padStart(6, "0"), 488, 96, 18, "#f5dfb4", 700);
  text(ctx, "CELLS", 673, 78, 9, "#789287");
  for (let i = 0; i < s.cells; i++) sprite(ctx, "cell", 726 + i * 28, 83);
  // The open strip between channel legs keeps every readout off the train.
  sprite(ctx, "pressure", 290, 169);
  text(ctx, "PRESSURE", 312, 159, 10, "#a6b8a7");
  ctx.fillStyle = "#08171d";
  ctx.fillRect(312, 169, 120, 7);
  ctx.fillStyle = s.pressure > 70 ? "#ed9273" : "#c8ac72";
  ctx.fillRect(312, 169, (120 * s.pressure) / C.PRESSURE_MAX, 7);
  text(ctx, `${Math.round(s.pressure)}%`, 445, 177, 11, "#d8c8a1");
  text(ctx, "INLET RESERVE", 528, 159, 10, "#8ca396");
  text(
    ctx,
    String(s.quotaRemaining).padStart(2, "0"),
    528,
    184,
    22,
    "#d6dcbf",
    700,
  );
  text(ctx, `/ ${C.LEVELS[s.level - 1].quota}`, 563, 183, 12, "#718e83");
  text(ctx, "CHAIN", 678, 159, 10, "#8ca396");
  text(ctx, `×${s.chainStep}`, 678, 184, 22, "#d8c6a0", 700);
  panel(ctx, 675, 249, 130, 139);
  text(ctx, "INJECTOR", 689, 272, 10, "#a9b6a1");
  if (s.loaded) sprite(ctx, s.loaded, 704, 300);
  if (s.queued) sprite(ctx, s.queued, 773, 300);
  text(ctx, "LOAD", 704, 328, 9, "#c9d3bd", 500, "center");
  text(ctx, "NEXT", 773, 328, 9, "#7f9b8e", 500, "center");
  line(ctx, 737, 292, 737, 320);
  text(ctx, "X  EXCHANGE", 740, 366, 10, "#c2a779", 500, "center");
  if (s.machinery) {
    sprite(ctx, s.machinery.kind, 284, 385);
    text(
      ctx,
      `${s.machinery.kind.toUpperCase()}  ${s.machinery.remaining.toFixed(1)}s`,
      303,
      389,
      10,
      "#f0d698",
    );
  } else text(ctx, "MATCH 3+ TO EXTRACT", 269, 389, 10, "#839c90");
  text(ctx, "AIM  MOUSE / A D", 270, 461, 10, "#9aafa0");
  text(ctx, "FIRE  CLICK / SPACE", 470, 461, 10, "#9aafa0");
  text(ctx, "P  PAUSE", 270, 478, 9, "#6d897d");
  text(ctx, `M  SOUND ${s.muted ? "OFF" : "ON"}`, 470, 478, 9, "#6d897d");
  if (danger(s)) {
    ctx.strokeStyle = "#e28a64";
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, C.FIELD_W - 6, C.FIELD_H - 6);
    text(ctx, "!  INTAKE CRITICAL", 760, 213, 11, "#ffc391", 700, "center");
  }
}
/** Replaying the short seeded simulation to its derived age keeps rendering pure,
 * pause-stable and independent of how many times render is called. */
function effect(ctx: CanvasRenderingContext2D, v: VisualEvent) {
  const source = systems[v.kind];
  if (!source) return;
  const system: ParticleSystem =
    v.charge && v.kind === "burst"
      ? {
          ...source,
          emitters: source.emitters.map((e) => ({
            ...e,
            particle: {
              ...e.particle,
              colorGradient: [
                { at: 0, color: PALETTE[v.charge!] },
                { at: 1, color: PALETTE[v.charge!] },
              ],
            },
          })),
        }
      : source;
  ctx.save();
  ctx.translate(v.x - C.FIELD_W / 2, v.y - C.FIELD_H / 2);
  ctx.scale(C.FIELD_W / ctx.canvas.width, C.FIELD_H / ctx.canvas.height);
  const player = new ParticleCanvasPlayer(system, ctx, {
    clear: false,
    pixelRadius: v.kind === "bore" ? 5 : 3,
    seed: v.seed,
  });
  // The simulator steps its live forces and emission; only the final frame is drawn.
  player.simulator.step(Math.max(0, v.age - C.TICK_DT) * 1000);
  player.update(C.TICK_DT);
  ctx.restore();
  if (v.kind === "burst" && v.age < 0.3) {
    ctx.save();
    ctx.globalAlpha = 1 - v.age / 0.3;
    const name = `flash-${Math.min(5, Math.floor(v.age / 0.05))}`;
    sprite(
      ctx,
      images[`${name}-${v.charge}`] ? `${name}-${v.charge}` : name,
      v.x,
      v.y,
    );
    ctx.restore();
  }
  if (v.kind === "swallow" && v.age < 0.6)
    sprite(ctx, `swallow-${Math.min(5, Math.floor(v.age / 0.1))}`, v.x, v.y);
}
function title(ctx: CanvasRenderingContext2D, s: State) {
  ctx.fillStyle = "#071318c9";
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  text(
    ctx,
    "VOLUTE INDUSTRIAL   /   GEOTHERMAL DIVISION",
    84,
    86,
    11,
    "#9fae96",
  );
  text(ctx, "EST. 2086", 876, 86, 10, "#6b8478", 500, "right");
  line(ctx, 84, 102, 876, 102, "#4d6255");
  text(ctx, "01 — MINERAL RECOVERY", 84, 149, 11, "#d3b77f");
  text(ctx, C.TITLE_TEXT, 77, 240, 94, "#f1e3bc", 900);
  text(ctx, "Keep the hall running.", 84, 284, 25, "#c7d5bc", 500);
  text(
    ctx,
    "Fire mineral cores. Gather matching charges.",
    85,
    318,
    12,
    "#a5bcae",
  );
  text(
    ctx,
    "Extract the train before the intake takes it.",
    85,
    340,
    12,
    "#a5bcae",
  );
  ctx.fillStyle = "#d6bd83";
  ctx.fillRect(84, 373, 368, 46);
  text(ctx, "ENTER / CLICK TO BEGIN", 268, 402, 14, "#14292c", 700, "center");
  text(
    ctx,
    "5 HALLS   /   3 CELLS   /   ONE UNBROKEN TRAIN",
    84,
    442,
    10,
    "#819b8d",
  );
  // Instrument-style mineral catalogue uses the same actual game sprites.
  panel(ctx, 592, 137, 284, 305);
  text(ctx, "CORE IDENTIFICATION", 613, 165, 11, "#d5c394");
  text(ctx, "CHARGE   /   SIGNATURE", 613, 185, 9, "#6f8e80");
  C.CHARGE_IDS.forEach((charge, i) => {
    const y = 215 + i * 44;
    sprite(ctx, charge, 629, y);
    text(ctx, charge.toUpperCase(), 656, y + 4, 12, PALETTE[charge]);
    text(ctx, `0${i + 1}`, 854, y + 4, 10, "#789283", 500, "right");
    if (i < 4) line(ctx, 613, y + 22, 855, y + 22, "#243d3b");
  });
  line(ctx, 84, 466, 876, 466, "#4d6255");
  text(ctx, "MOUSE / A D  AIM", 84, 493, 10, "#b4c3ae");
  text(ctx, "CLICK / SPACE  FIRE", 288, 493, 10, "#b4c3ae");
  text(ctx, "X  SWAP", 524, 493, 10, "#b4c3ae");
  text(ctx, "P / ESC  PAUSE", 660, 493, 10, "#b4c3ae");
  text(
    ctx,
    `M  ${s.muted ? "UNMUTE" : "MUTE"}`,
    876,
    493,
    10,
    "#b4c3ae",
    500,
    "right",
  );
}
function overlay(ctx: CanvasRenderingContext2D, s: State) {
  const ending = s.screen === "gameover" || s.screen === "victory";
  ctx.fillStyle = "#071318b8";
  ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
  panel(ctx, 250, 193, 390, 192);
  const titles = {
    paused: "HALL ON HOLD",
    cleared: `HALL ${String(s.level).padStart(2, "0")} CLEARED`,
    setback: "CELL LOST",
    gameover: "PRESSURE WINS",
    victory: "ALL HALLS CLEAR",
    title: "",
    playing: "",
  };
  text(
    ctx,
    s.screen === "victory" ? "RECOVERY COMPLETE" : "VOLUTE / OPERATIONS",
    445,
    225,
    10,
    "#bdab7d",
    500,
    "center",
  );
  text(ctx, titles[s.screen], 445, 267, 30, "#f3dfb3", 800, "center");
  const detail =
    s.screen === "setback"
      ? `${s.cells} CELLS REMAIN • RESTARTING HALL ${s.level}`
      : s.screen === "paused"
        ? "Take a breath. The train can wait."
        : `SCORE ${String(s.score).padStart(6, "0")}   /   ${s.screen === "victory" ? `${C.LEVEL_COUNT} HALLS CLEARED` : `HALL ${s.level}`}`;
  text(ctx, detail, 445, 301, 12, "#b7c8b7", 500, "center");
  text(
    ctx,
    ending
      ? "ENTER / CLICK TO RETURN"
      : s.screen === "paused"
        ? "P / ESC TO RESUME"
        : `RESUMING IN ${Math.ceil(s.interlude)}`,
    445,
    350,
    11,
    "#e3c990",
    500,
    "center",
  );
}
export function render(s: State, api: RenderApi) {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  background(ctx);
  channel(ctx);
  for (const core of s.cores) {
    const p = location(core.s);
    sprite(ctx, core.charge, p.x, p.y);
    if (core.mark) sprite(ctx, core.mark, p.x, p.y);
  }
  injector(ctx, s);
  for (const p of s.projectiles) sprite(ctx, p.charge, p.x, p.y);
  for (const v of s.visuals) effect(ctx, v);
  if (s.screen === "title") title(ctx, s);
  else {
    if (s.screen !== "playing") overlay(ctx, s);
    if (["playing", "paused", "cleared", "setback"].includes(s.screen))
      hud(ctx, s);
  }
}
