import type { CSSProperties, ReactNode } from "react";
import { ArrowUpRight, FileText, House, Landmark, Microscope, type LucideIcon } from "lucide-react";
import styles from "./overview.module.css";

type Layer = {
  icon: LucideIcon;
  label: string;
  body: ReactNode;
  host: string;
};

// 실제 검색(공간 광변조기·디지털 홀로그래피, 후보 1위)에서 나온 내용을 줄여 옮긴 미니어처.
const LAYERS: Layer[] = [
  {
    icon: FileText,
    label: "논문 초록",
    body: (
      <>
        “Complex <mark>spatial light modulator</mark> (SLM), which can simultaneously control the amplitude and phase…”
      </>
    ),
    host: "openalex.org",
  },
  {
    icon: House,
    label: "연구실 페이지",
    body: (
      <>
        <mark>공간 광변조기</mark>·<mark>디지털 홀로그래피</mark> 언급 확인
      </>
    ),
    host: "tlo.korea.ac.kr",
  },
  {
    icon: Microscope,
    label: "ZEUS 장비",
    body: (
      <>
        <mark>공간 광변조기</mark> · 전국 22대 · 공동활용 4대
      </>
    ),
    host: "zeus.go.kr",
  },
  {
    icon: Landmark,
    label: "NTIS 국가과제",
    body: (
      <>
        연구책임자 표기 <mark>김휘</mark> · 한글 이름 확인
      </>
    ),
    host: "ntis.go.kr",
  },
];

export const LAYER_COUNT = LAYERS.length;

export default function EvidenceStack({ active }: { active: number | null }) {
  return (
    <div data-scene="lens" className={styles.lens} aria-hidden="true">
      {LAYERS.map((l, i) => {
        const Icon = l.icon;
        return (
          <div
            key={l.label}
            className={styles.layer}
            style={{ "--i": i - (LAYERS.length - 1) / 2, zIndex: i } as CSSProperties}
          >
            <div className={styles.layerHead}>
              <span className={styles.layerIcon}>
                <Icon strokeWidth={1.75} />
              </span>
              <span>{l.label}</span>
            </div>
            <p className={styles.layerBody}>{l.body}</p>
            <div className={styles.layerHost}>
              {l.host}
              <ArrowUpRight strokeWidth={1.75} />
            </div>
            <span className={styles.glow} data-on={active === i ? "true" : "false"} />
          </div>
        );
      })}
    </div>
  );
}
