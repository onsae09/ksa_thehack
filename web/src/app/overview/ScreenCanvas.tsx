"use client";

import { useEffect, useRef, type RefObject } from "react";
import styles from "./overview.module.css";

export type ZoomView = { zoom: number; extra: number };

// 확대 목표: 결과 화면 스크린샷(4320×2400) 안에서 노란 하이라이트 "spatial light modulator"의 중심과 반지름.
export const TARGET = { x: 2890, y: 1427, r: 280 };
const TARGET_ON_SCREEN = 210; // 확대 끝에서 목표 반지름 (디자인 px)
const TARGET_ON_SCREEN_PHONE = 150;
const EXTRA_PUSH = 0.3;

export default function ScreenCanvas({
  bitmapRef,
  viewRef,
  probeRef,
}: {
  bitmapRef: RefObject<ImageBitmap | null>;
  viewRef: RefObject<ZoomView>;
  probeRef: RefObject<HTMLDivElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let W = 0;
    let H = 0;
    let dpr = 1;
    let unit = 1;
    let sizeDirty = true;
    let last = { zoom: -1, extra: -1, img: null as ImageBitmap | null };
    let raf = 0;

    const measure = () => {
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      const probe = probeRef.current;
      unit = probe ? probe.getBoundingClientRect().width / 100 : 1;
      sizeDirty = true;
    };

    const draw = (img: ImageBitmap, zoom: number, extra: number) => {
      const s0 = Math.max(W / img.width, H / img.height);
      // 가로가 좁은 화면(세로 화면)에서는 근거 패널이 보이도록 목표 쪽으로 붙인다.
      const centred = (W - img.width * s0) / 2;
      const left0 =
        W < H ? Math.min(0, Math.max(W - img.width * s0, W / 2 - TARGET.x * s0)) : centred;
      const top0 = (H - img.height * s0) * 0.25;
      const q0 = { x: left0 + TARGET.x * s0, y: top0 + TARGET.y * s0 };
      const onScreen = window.innerWidth < 1024 ? TARGET_ON_SCREEN_PHONE : TARGET_ON_SCREEN;
      const s1 = (onScreen * unit) / TARGET.r;
      const s = s0 * Math.pow(s1 / s0, zoom);
      const w = s1 === s0 ? 1 : (s - s0) / (s1 - s0);
      const qx = q0.x + (W / 2 - q0.x) * w;
      const qy = q0.y + (H / 2 - q0.y) * w;
      const scale = s * (1 + EXTRA_PUSH * extra);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, TARGET.x - qx / scale, TARGET.y - qy / scale, W / scale, H / scale, 0, 0, canvas.width, canvas.height);
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const img = bitmapRef.current;
      const v = viewRef.current;
      if (!img || !v) return;
      if (!sizeDirty && last.img === img && last.zoom === v.zoom && last.extra === v.extra) return;
      sizeDirty = false;
      last = { zoom: v.zoom, extra: v.extra, img };
      draw(img, v.zoom, v.extra);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [bitmapRef, viewRef, probeRef]);

  return <canvas ref={canvasRef} data-scene="portrait" className={styles.canvas} aria-hidden="true" />;
}
