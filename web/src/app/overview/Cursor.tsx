"use client";

import { useEffect, useRef } from "react";
import styles from "./overview.module.css";

const FOLLOW = 0.3; // 60fps 한 프레임에 남은 거리의 30%를 따라간다

export default function Cursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!mq.matches) return;

    const pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const target = { ...pos };
    let raf = 0;
    let lastT = performance.now();

    const place = () => {
      el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`;
    };
    place();

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(100, t - lastT);
      lastT = t;
      const k = 1 - Math.pow(1 - FOLLOW, dt / 16.67);
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return;
      pos.x += dx * k;
      pos.y += dy * k;
      place();
    };

    const onMove = (e: MouseEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      el.dataset.visible = "true";
    };
    const onOut = (e: MouseEvent) => {
      if (!e.relatedTarget) el.dataset.visible = "false";
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseout", onOut);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseout", onOut);
    };
  }, []);

  return <div ref={ref} className={styles.cursor} data-visible="false" aria-hidden="true" />;
}
