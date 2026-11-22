"use client";

import { useEffect, useRef, useState, type FocusEvent, type MouseEvent, type PointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import Cursor from "./Cursor";
import EvidenceStack from "./EvidenceStack";
import Hud from "./Hud";
import ScreenCanvas, { type ZoomView } from "./ScreenCanvas";
import styles from "./overview.module.css";

const SCREEN_SRC = "/overview/results.webp";

// 스크롤 장면 길이(타임라인 단위)와 이동 지점
const SCENE_LEN = 3;
const AT_SCANNER = 1.05;
const AT_FEATURES = 2.8;

const HEADLINE = ["그 주제를, 그 방법으로", "연구해 본 교수님"];

const FEATURES = [
  {
    title: "논문 초록",
    copy: "주제와 방법이 함께 나오는 초록 문장을 찾아 원문 그대로 옮깁니다.",
  },
  {
    title: "연구실 페이지",
    copy: "연구실 홈페이지에 그 장비와 방법이 실제로 적혀 있는지 확인합니다.",
  },
  {
    title: "국가 장비 (ZEUS)",
    copy: "필요한 장비가 그 기관에 등록되어 있는지, 공동활용이 되는지 봅니다.",
  },
  {
    title: "국가과제 (NTIS)",
    copy: "같은 주제의 국가과제를 맡은 기록이 있는지 연구책임자 이름으로 찾습니다.",
  },
];

async function loadBitmap(): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(SCREEN_SRC);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await createImageBitmap(await res.blob());
  } catch (e) {
    console.warn("[overview] 화면 이미지를 불러오지 못했습니다", e);
    return null;
  }
}

async function loadFonts(latinFamily: string) {
  const sample = HEADLINE.join("") + "네 겹의 근거지어낸 말은 없이";
  const loads = [400, 500, 600].map((w) => document.fonts.load(`${w} 32px "Pretendard Variable"`, sample));
  loads.push(document.fonts.load(`500 20px ${latinFamily}`, "LabFit KR 0123456789"));
  await Promise.race([Promise.allSettled(loads), new Promise((r) => setTimeout(r, 2500))]);
}

export default function Overview({ fontClass, latinFamily }: { fontClass: string; latinFamily: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const viewRef = useRef<ZoomView>({ zoom: 0, extra: 0 });
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    gsap.registerPlugin(ScrollTrigger);
    const q = gsap.utils.selector(root);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const view = viewRef.current;
    const lensBox = q("[data-scene=lens]")[0] as HTMLElement | undefined;
    let cancelled = false;
    let ctx: gsap.Context | null = null;
    let bitmap: ImageBitmap | null = null;

    (async () => {
      const [bmp] = await Promise.all([loadBitmap(), loadFonts(latinFamily)]);
      if (cancelled) {
        bmp?.close();
        return;
      }
      bitmap = bmp;
      bitmapRef.current = bmp;
      view.zoom = 0;
      view.extra = 0;

      ctx = gsap.context(() => {
        // ── M1 인트로 ──
        const canvas = q("[data-scene=portrait]");
        const end = { opacity: 1, y: 0, filter: "blur(0px)", clearProps: "filter,transform" };
        const intro = gsap.timeline({ defaults: { ease: "power2.out" } });
        if (reduce) {
          intro.fromTo(
            [canvas, q("[data-reveal]"), q("h1")],
            { opacity: 0 },
            { opacity: 1, duration: 0.4, ease: "power1.out" },
            0,
          );
        } else {
          intro
            .fromTo(canvas, { opacity: 0, filter: "blur(40px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.6, clearProps: "filter" }, 0)
            .fromTo(q("[data-reveal=header]"), { opacity: 0, y: 24, filter: "blur(8px)" }, { ...end, duration: 0.45 }, 0.1)
            .fromTo(q("[data-reveal=label]"), { opacity: 0, y: 20, filter: "blur(8px)" }, { ...end, duration: 0.45 }, 0.1)
            .fromTo(q("[data-reveal=body]"), { opacity: 0, y: 30, filter: "blur(8px)" }, { ...end, duration: 0.5 }, 0.35)
            .set(q("h1"), { opacity: 1 }, 0.35)
            .fromTo(
              q("[data-line='0'] [data-char]"),
              { opacity: 0, yPercent: 35, filter: "blur(12px)" },
              { opacity: 1, yPercent: 0, filter: "blur(0px)", duration: 0.4, stagger: 0.02, clearProps: "filter,transform" },
              0.35,
            )
            .fromTo(
              q("[data-line='1'] [data-char]"),
              { opacity: 0, yPercent: 35, filter: "blur(12px)" },
              { opacity: 1, yPercent: 0, filter: "blur(0px)", duration: 0.4, stagger: 0.02, clearProps: "filter,transform" },
              0.47,
            )
            .fromTo(q("[data-reveal=buttons]"), { opacity: 0, y: 20, filter: "blur(8px)" }, { ...end, duration: 0.5 }, 0.55)
            .fromTo(q("[data-reveal=scroll]"), { opacity: 0, y: 20, filter: "blur(8px)" }, { ...end, duration: 0.5 }, 0.6)
            .fromTo(q("[data-reveal=callout]"), { opacity: 0, y: 16, filter: "blur(10px)" }, { ...end, duration: 0.4 }, 0.95);
        }

        // ── M2 스크롤 장면 ──
        const hud = q("[data-scene=hud]");
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: { trigger: sceneRef.current, start: "top top", end: "bottom bottom", scrub: 1 },
        });
        if (!reduce) {
          tl.fromTo(view, { zoom: 0 }, { zoom: 1, duration: 1, ease: "power1.inOut" }, 0)
            .fromTo(hud, { opacity: 0, scale: 0.9, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.4, ease: "power2.out" }, 0.65)
            .fromTo(q("[data-draw]"), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4, ease: "power2.out" }, 0.65)
            .fromTo(q("[data-scene=hud-ring]"), { rotation: -20, svgOrigin: "0 0" }, { rotation: 25, svgOrigin: "0 0", duration: 1.05 }, 0.65)
            .fromTo(q("[data-scene=hud-scan]"), { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.75)
            .fromTo(
              q("[data-scene=hud-mesh]"),
              { opacity: 0, scale: 0.92, svgOrigin: "0 0" },
              { opacity: 1, scale: 1, svgOrigin: "0 0", duration: 0.25, ease: "power2.out" },
              0.95,
            );
        }
        tl.fromTo(q("[data-scene=track]"), { yPercent: 0 }, { yPercent: -50, duration: 0.7, ease: "power1.inOut" }, 1.0);
        if (!reduce) tl.fromTo(view, { extra: 0 }, { extra: 1, duration: 0.35, ease: "power1.in" }, 1.4);
        tl.fromTo(q("[data-scene=wash]"), { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power1.inOut" }, 1.4);
        if (lensBox) {
          if (reduce) {
            gsap.set(lensBox, { "--spread": 1 });
            tl.fromTo(lensBox, { opacity: 0 }, { opacity: 1, duration: 0.4 }, 1.5);
          } else {
            tl.to(hud, { opacity: 0, scale: 1.3, duration: 0.3, ease: "power1.in" }, 1.4);
            tl.fromTo(lensBox, { opacity: 0, scale: 1.6 }, { opacity: 1, scale: 1, duration: 0.4, ease: "power2.out" }, 1.5);
            const blur = { px: 16 };
            tl.fromTo(
              blur,
              { px: 16 },
              {
                px: 0,
                duration: 0.4,
                ease: "power2.out",
                onUpdate: () => {
                  lensBox.style.filter = blur.px > 0.05 && blur.px < 15.95 ? `blur(${blur.px}px)` : "";
                },
              },
              1.5,
            );
            tl.fromTo(lensBox, { "--spread": 0 }, { "--spread": 1, duration: 0.6, ease: "power2.inOut" }, 2.2);
          }
        }
        tl.set({}, {}, SCENE_LEN);

        // 장면이 끝나 본문이 헤더 밑으로 지나갈 때만 헤더에 바탕을 깐다.
        ScrollTrigger.create({
          trigger: q("[data-closing]")[0],
          start: "top bottom",
          onToggle: (self) => {
            const header = q("[data-reveal=header]")[0] as HTMLElement | undefined;
            if (header) header.dataset.solid = self.isActive ? "true" : "false";
          },
        });
      }, root);
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
      if (lensBox) lensBox.style.filter = "";
      bitmapRef.current = null;
      bitmap?.close();
    };
  }, [latinFamily]);

  // 장면 안의 한 지점(타임라인 단위)으로 스크롤
  const goTo = (at: number) => (e: MouseEvent) => {
    e.preventDefault();
    const scene = sceneRef.current;
    const pin = pinRef.current;
    if (!scene || !pin) return;
    const top = scene.getBoundingClientRect().top + window.scrollY;
    const dist = scene.offsetHeight - pin.offsetHeight;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: top + (dist * at) / SCENE_LEN, behavior: reduce ? "auto" : "smooth" });
  };

  const cardHandlers = (i: number) => ({
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType === "mouse") setActive(i);
    },
    onPointerLeave: (e: PointerEvent) => {
      if (e.pointerType === "mouse") setActive((a) => (a === i ? null : a));
    },
    onFocus: () => setActive(i),
    onBlur: (e: FocusEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActive((a) => (a === i ? null : a));
    },
  });

  return (
    <div ref={rootRef} className={`${styles.root} ${fontClass}`}>
      <div ref={probeRef} className={styles.probe} aria-hidden="true" />

      <header data-reveal="header" data-solid="false" className={styles.header}>
        <Link href="/" className={styles.wordmark} aria-label="LabFit KR 지도교수 찾기로 가기">
          LabFit <span>KR</span>
        </Link>
        <nav className={styles.nav} aria-label="소개 페이지 안내">
          <a href="#how" onClick={goTo(AT_SCANNER)}>
            작동 방식
          </a>
          <a href="#evidence" onClick={goTo(AT_FEATURES)}>
            근거
          </a>
          <a href="#principles">원칙</a>
          <a href="#sources">데이터 출처</a>
        </nav>
        <Link href="/" className={`${styles.pill} ${styles.headerButton}`}>
          지도교수 찾기
        </Link>
      </header>

      <main>
        <div ref={sceneRef} data-scene="scene" className={styles.scene}>
          <div ref={pinRef} className={styles.pin}>
            <div className={styles.stage}>
              <ScreenCanvas bitmapRef={bitmapRef} viewRef={viewRef} probeRef={probeRef} />
              <div data-scene="wash" className={styles.wash} />
              <Hud />
              <EvidenceStack active={active} />
            </div>

            <div data-scene="track" className={styles.track}>
              {/* 첫 화면 */}
              <section id="how" className={styles.hero} aria-labelledby="ov-hero-title">
                <div className={styles.heroVeil} aria-hidden="true" />
                <div className={styles.heroTop}>
                  <p data-reveal="label" className={styles.eyebrow}>
                    고등학생 R&amp;E 지도교수 찾기
                  </p>
                  <h1 id="ov-hero-title" className={styles.display} aria-label={HEADLINE.join(" ")}>
                    {HEADLINE.map((line, li) => (
                      <span key={line} data-line={li} className={li === 1 ? styles.lineAccent : styles.line} aria-hidden="true">
                        {Array.from(line).map((ch, ci) => (
                          <span key={ci} data-char="" className={styles.char}>
                            {ch}
                          </span>
                        ))}
                      </span>
                    ))}
                  </h1>
                </div>

                <div data-reveal="callout" className={styles.callout}>
                  <div className={styles.calloutCard}>
                    <div className={styles.calloutRow}>
                      <div className={styles.calloutText}>
                        <span className={styles.calloutFigure}>
                          약 <b>48</b>초
                        </span>
                        <span className={styles.calloutMuted}>제안서 PDF 한 장으로 후보 15명</span>
                      </div>
                      <Link href="/" className={`${styles.pill} ${styles.calloutPill}`}>
                        시작
                        <ArrowRight aria-hidden="true" strokeWidth={2} />
                      </Link>
                    </div>
                    <Image
                      className={styles.calloutImage}
                      src="/overview/evidence-crop.webp"
                      width={600}
                      height={296}
                      alt="결과 화면의 근거 문장. 논문 초록에서 ‘spatial light modulator’가 노란색으로 표시되어 있다."
                      unoptimized
                    />
                  </div>
                  <div className={styles.pager} aria-hidden="true">
                    <span data-on="true" />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>

                <div className={styles.heroBottom}>
                  <p data-reveal="body" className={styles.text}>
                    연구 질문이나 연구제안서 PDF를 넣으면, 그 주제를 그 방법으로 연구해 본 국내 교수님을 찾아 논문·연구실·장비·국가과제 기록의 원문 문장과 함께 보여줍니다.
                  </p>
                  <div data-reveal="buttons" className={styles.buttons}>
                    <Link href="/" className={`${styles.pill} ${styles.primary}`}>
                      지금 찾아보기
                    </Link>
                    <a href="#evidence" onClick={goTo(AT_FEATURES)} className={`${styles.pill} ${styles.secondary}`}>
                      어떻게 찾나요
                    </a>
                  </div>
                </div>

                <div data-reveal="scroll" className={styles.scrollHint} aria-hidden="true">
                  <span>아래로 스크롤</span>
                  <span className={styles.scrollCircle}>
                    <ArrowDown strokeWidth={1.75} />
                  </span>
                </div>
              </section>

              {/* 둘째 화면 */}
              <section id="evidence" className={styles.features} aria-labelledby="ov-features-title">
                <h2 id="ov-features-title" className={`${styles.display} ${styles.featuresTitle}`}>
                  <span className={styles.line}>네 겹의 근거.</span>
                  <span className={styles.lineAccent}>지어낸 말은 없이.</span>
                </h2>
                <p className={`${styles.text} ${styles.lead}`}>
                  후보마다 서로 따로 모은 네 곳의 기록과 맞춰 봅니다. 문장은 원문에서 그대로 옮기고, 찾지 못한 항목은 찾지 못했다고 적습니다.
                </p>
                <div className={styles.cards}>
                  {FEATURES.map((f, i) => (
                    <article
                      key={f.title}
                      tabIndex={0}
                      className={styles.card}
                      data-active={active === i ? "true" : "false"}
                      {...cardHandlers(i)}
                    >
                      <div className={styles.cardHead}>
                        <h3>{f.title}</h3>
                        <span className={styles.cardNum}>{String(i + 1).padStart(2, "0")}</span>
                      </div>
                      <p className={styles.cardCopy}>{f.copy}</p>
                      <div className={styles.cardArrow} aria-hidden="true">
                        <div>
                          <ArrowUpRight strokeWidth={1.5} />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>

        <section data-closing="" className={styles.closing} aria-labelledby="ov-closing-title">
          <div className={styles.closingMain}>
            <h2 id="ov-closing-title" className={styles.closingTitle}>
              질문 한 줄이면 시작합니다.
            </h2>
            <p className={styles.text}>연구 질문 한 줄이나 연구제안서 PDF 한 장이면 됩니다.</p>
            <Link href="/" className={`${styles.pill} ${styles.primary}`}>
              지도교수 찾기
            </Link>
          </div>
          <div id="principles" className={styles.closingCol}>
            <h3>원칙</h3>
            <ul>
              <li>모든 근거에 원문 링크를 붙입니다.</li>
              <li>추정한 값은 ‘추정’이라고 표시합니다.</li>
              <li>찾지 못하면 찾지 못했다고 말합니다.</li>
            </ul>
          </div>
          <p id="sources" className={styles.sources}>
            데이터 출처 <span>OpenAlex · DBpia · 국가연구시설장비 ZEUS · 국가과제 NTIS · 공공데이터포털 · Exa</span>
          </p>
        </section>
      </main>

      <Cursor />
    </div>
  );
}
