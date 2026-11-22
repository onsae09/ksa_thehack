import styles from "./overview.module.css";

// 근거 문장 위에 그려지는 스캐너. 좌표는 화면 중심 기준(viewBox -320..320), 각도는 3시 방향에서 시계 방향.
const RING_R = 265;

const point = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
};
const arc = ([from, to]: [number, number]) =>
  `M ${point(from, RING_R)} A ${RING_R} ${RING_R} 0 ${to - from > 180 ? 1 : 0} 1 ${point(to, RING_R)}`;
const circle = (r: number, from: number) =>
  `M ${point(from, r)} A ${r} ${r} 0 1 1 ${point(from + 180, r)} A ${r} ${r} 0 1 1 ${point(from, r)}`;

const RING_ARCS: [number, number][] = [
  [121, 257],
  [270, 338],
  [27, 60],
];
const SCAN_YS = Array.from({ length: 51 }, (_, i) => -201 + i * 8);
const SPOKES = Array.from({ length: 24 }, (_, i) => i * 15);
const MESH_RS = [150, 190];

export default function Hud() {
  return (
    <div className={styles.hudWrap} aria-hidden="true">
      <svg data-scene="hud" className={styles.hud} viewBox="-320 -320 640 640">
        <defs>
          <clipPath id="ov-hud-clip">
            <circle r="205" />
          </clipPath>
          <filter id="ov-hud-bloom" x="-20%" y="-20%" width="140%" height="140%">
            <feFlood style={{ floodColor: "var(--hud-glow)" }} floodOpacity="0.55" result="c" />
            <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="wa" />
            <feComposite in="c" in2="wa" operator="in" result="wide" />
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="ta" />
            <feComposite in="c" in2="ta" operator="in" result="tight" />
            <feMerge>
              <feMergeNode in="wide" />
              <feMergeNode in="tight" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g data-scene="hud-scan" className={styles.hudScan} clipPath="url(#ov-hud-clip)">
          {SCAN_YS.map((y) => (
            <line key={y} x1={-205} x2={205} y1={y} y2={y} />
          ))}
        </g>

        <g data-scene="hud-mesh" className={styles.hudMesh}>
          {MESH_RS.map((r) => (
            <circle key={r} r={r} />
          ))}
          {SPOKES.map((d) => (
            <path key={d} d={`M ${point(d, 105)} L ${point(d, 190)}`} />
          ))}
          {SPOKES.flatMap((d) =>
            MESH_RS.map((r) => {
              const a = (d * Math.PI) / 180;
              return <circle key={`${d}-${r}`} className={styles.hudDot} cx={(r * Math.cos(a)).toFixed(2)} cy={(r * Math.sin(a)).toFixed(2)} r={1.6} />;
            }),
          )}
        </g>

        <g className={styles.hudStrokes} filter="url(#ov-hud-bloom)">
          <g data-scene="hud-ring">
            {RING_ARCS.map((a) => (
              <path key={a[0]} data-draw="" pathLength={1} d={arc(a)} />
            ))}
          </g>
          <path data-draw="" pathLength={1} d="M-200 0 H-300" />
          <path data-draw="" pathLength={1} d="M200 0 H305" />
          <path data-draw="" pathLength={1} className={styles.hudInner} d={circle(80, -90)} />
          <path data-draw="" pathLength={1} className={styles.hudInner} d={circle(105, 90)} />
        </g>
      </svg>
    </div>
  );
}
