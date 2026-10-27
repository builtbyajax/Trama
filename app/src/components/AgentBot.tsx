import type { CSSProperties } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { t } from "../lib/i18n";

/** The ghost with its hem as a wave, at `phase` (0 to 1) of the wave passing under it. */
function ghostAt(phase: number) {
  const left = 3.9;
  const right = 12.9;
  const steps = 14;
  const n = (v: number) => +v.toFixed(2);
  // The wave fades out at both corners, so they stay round.
  const y = (x: number) =>
    13.95 +
    0.55 *
      Math.min(1, (13.6 - x) / 1.6, (x - left) / 1.6) *
      Math.sin((2 * Math.PI * (x - left)) / 4.6 - 2 * Math.PI * phase);
  const hem = Array.from({ length: steps + 1 }, (_, i) => {
    const x = right - ((right - left) * i) / steps;
    return [x, y(x)];
  });
  let d = `M8 1.6C11.4 1.6 13.6 4 13.6 7.4V13.2C13.6 13.8 13.3 ${n(hem[0][1])} ${right} ${n(hem[0][1])}`;
  // Smooth curves through the points (Catmull-Rom).
  for (let i = 0; i < steps; i++) {
    const [a, b, c, e] = [
      hem[Math.max(0, i - 1)],
      hem[i],
      hem[i + 1],
      hem[Math.min(steps, i + 2)],
    ];
    d += `C${n(b[0] + (c[0] - a[0]) / 6)} ${n(b[1] + (c[1] - a[1]) / 6)} ${n(c[0] - (e[0] - b[0]) / 6)} ${n(c[1] - (e[1] - b[1]) / 6)} ${n(c[0])} ${n(c[1])}`;
  }
  const [end, before] = [hem[steps], hem[steps - 1]];
  const slope = (end[1] - before[1]) / (end[0] - before[0]);
  return `${d}C${n(end[0] - 0.9)} ${n(end[1] - slope * 0.9)} 2.4 10.8 2.4 7.4C2.4 4 4.6 1.6 8 1.6Z`;
}
/** One wave, as frames for the hem's animation. */
const ghostWave = Array.from({ length: 9 }, (_, i) => ghostAt(i / 8)).join(";");

// An agent profile's character: a shape filled in its color, with eyes. Drawn on a 16 pt grid.
const shapes = {
  blob: "M8 1.6C11.9 1.6 14.4 4.3 14.4 8.2 14.4 12 11.7 14.4 8 14.4S1.6 12 1.6 8.2C1.6 4.3 4.1 1.6 8 1.6Z",
  ghost: ghostAt(0),
  cat: "M2.4 6.4 2.9 1.9C3 1.4 3.5 1.2 3.9 1.5L6.4 3.7H9.6L12.1 1.5C12.5 1.2 13 1.4 13.1 1.9L13.6 6.4C14 7.2 14.3 8.2 14.3 9.4 14.3 12.6 11.6 14.4 8 14.4S1.7 12.6 1.7 9.4C1.7 8.2 2 7.2 2.4 6.4Z",
  square:
    "M5.2 1.8H10.8C13 1.8 14.2 3 14.2 5.2V10.8C14.2 13 13 14.2 10.8 14.2H5.2C3 14.2 1.8 13 1.8 10.8V5.2C1.8 3 3 1.8 5.2 1.8Z",
  drop: "M8 1.4C9.4 3.3 13.6 6.8 13.6 10 13.6 12.9 11.2 14.6 8 14.6S2.4 12.9 2.4 10C2.4 6.8 6.6 3.3 8 1.4Z",
  triangle:
    "M6.6 2.6C7.2 1.6 8.8 1.6 9.4 2.6L14.6 11.8C15.2 12.9 14.4 14.2 13.2 14.2H2.8C1.6 14.2.8 12.9 1.4 11.8Z",
  slime:
    "M3 13.2C1.6 13.2 1 12.4 1.4 11.4 2 10 2.6 9.4 2.8 7.6 3.1 4.4 5.2 2.4 8 2.4s4.9 2 5.2 5.2c.2 1.8.8 2.4 1.4 3.8.4 1-.2 1.8-1.6 1.8Z",
  star: "M7.6 1.15Q8 0.7 8.4 1.15L9.73 2.64Q10.07 3.01 10.57 2.98L12.56 2.87Q13.16 2.84 13.13 3.44L13.02 5.43Q12.99 5.93 13.36 6.27L14.85 7.6Q15.3 8 14.85 8.4L13.36 9.73Q12.99 10.07 13.02 10.57L13.13 12.56Q13.16 13.16 12.56 13.13L10.57 13.02Q10.07 12.99 9.73 13.36L8.4 14.85Q8 15.3 7.6 14.85L6.27 13.36Q5.93 12.99 5.43 13.02L3.44 13.13Q2.84 13.16 2.87 12.56L2.98 10.57Q3.01 10.07 2.64 9.73L1.15 8.4Q0.7 8 1.15 7.6L2.64 6.27Q3.01 5.93 2.98 5.43L2.87 3.44Q2.84 2.84 3.44 2.87L5.43 2.98Q5.93 3.01 6.27 2.64Z",
};
export type BotShape = keyof typeof shapes;

/** Where the eyes sit: lower in the shapes that are narrow at the top. */
const eyeLine: Partial<Record<BotShape, number>> = {
  triangle: 9.6,
  drop: 9.4,
  slime: 8,
  star: 8.2,
  cat: 8.8,
};

const arc = (x: number, y: number) =>
  `M${x - 1.1} ${y + 0.6}Q${x} ${y - 1} ${x + 1.1} ${y + 0.6}`;
const eyes = {
  dots: (y: number) => (
    <>
      <circle cx="6" cy={y} r="1.15" />
      <circle cx="10" cy={y} r="1.15" />
    </>
  ),
  tall: (y: number) => (
    <>
      <rect x="5.2" y={y - 1.5} width="1.6" height="3" rx=".8" />
      <rect x="9.2" y={y - 1.5} width="1.6" height="3" rx=".8" />
    </>
  ),
  happy: (y: number) => (
    <path className="bot-line" d={arc(6, y) + arc(10, y)} />
  ),
  sleepy: (y: number) => (
    <path className="bot-line" d={`M4.9 ${y}H7.1M8.9 ${y}H11.1`} />
  ),
  wink: (y: number) => (
    <>
      {/* It winks the left eye: the suspicious look raises a brow over the right one. */}
      <circle cx="10" cy={y} r="1.15" />
      <path className="bot-line eye-shut" d={arc(6, y - 0.2)} />
      {/* Hidden: the shut eye opens into it, then winks again. */}
      <circle className="eye-peek" cx="6" cy={y} r="1.15" />
    </>
  ),
  focused: (y: number) => (
    <>
      <circle cx="6" cy={y + 0.3} r="1.05" />
      <circle cx="10" cy={y + 0.3} r="1.05" />
      <path
        className="bot-line"
        d={`M4.6 ${y - 2}L7.2 ${y - 1.2}M11.4 ${y - 2}L8.8 ${y - 1.2}`}
      />
    </>
  ),
  visor: (y: number) => (
    <>
      <rect x="4.2" y={y - 1.1} width="7.6" height="2.2" rx="1.1" />
      <rect
        className="bot-white"
        x="5.2"
        y={y - 0.5}
        width="1.6"
        height=".7"
        rx=".35"
      />
    </>
  ),
  angry: (y: number) => (
    <path
      d={`M4.65 ${y + 0.2}L7.35 ${y + 1.1}A1.4 1.4 0 0 1 4.65 ${y + 0.2}ZM11.35 ${y + 0.2}L8.65 ${y + 1.1}A1.4 1.4 0 0 0 11.35 ${y + 0.2}Z`}
    />
  ),
  suspicious: (y: number) => (
    <>
      <circle cx="10" cy={y} r="1.15" />
      <path className="bot-line" d={`M4.9 ${y + 0.2}H7.1`} />
      <path
        className="bot-line brow"
        d={`M8.8 ${y - 2.1}Q10 ${y - 2.9} 11.2 ${y - 2.2}`}
      />
    </>
  ),
};
export type BotEyes = keyof typeof eyes;

export const botShapes: { value: BotShape; label: string }[] = [
  { value: "blob", label: t("Blob") },
  { value: "ghost", label: t("Ghost") },
  { value: "cat", label: t("Cat") },
  { value: "square", label: t("Square") },
  { value: "drop", label: t("Drop") },
  { value: "triangle", label: t("Triangle") },
  { value: "slime", label: t("Slime") },
  { value: "star", label: t("Star") },
];
/** The eyes to pick. Sleepy ones stay out: they're how an idle agent shows. */
export const botEyes: { value: BotEyes; label: string }[] = [
  { value: "dots", label: t("Dots") },
  { value: "tall", label: t("Tall") },
  { value: "happy", label: t("Happy") },
  { value: "wink", label: t("Wink") },
  { value: "focused", label: t("Focused") },
  { value: "visor", label: t("Visor") },
  { value: "angry", label: t("Angry") },
  { value: "suspicious", label: t("Suspicious") },
];

export function AgentBot({
  shape,
  eyes: look,
  color,
  size = 14,
  className = "",
}: {
  shape: BotShape;
  eyes: BotEyes;
  color: string | undefined;
  size?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <svg
      className={`agent-bot ${className}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ "--bot": color } as CSSProperties}
      aria-hidden="true"
    >
      <path className="bot-body" d={shapes[shape] ?? shapes.blob}>
        {/* The ghost's hem ripples like cloth. Asleep, it hangs still. */}
        {shape === "ghost" && look !== "sleepy" && !reduceMotion && (
          <animate
            attributeName="d"
            values={ghostWave}
            dur="2s"
            repeatCount="indefinite"
          />
        )}
      </path>
      <g className={`bot-eyes ${look}`}>
        {(eyes[look] ?? eyes.dots)(eyeLine[shape] ?? 7.6)}
      </g>
    </svg>
  );
}
