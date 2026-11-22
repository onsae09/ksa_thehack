#!/usr/bin/env node
/**
 * 부정·가정 문맥 판정 테스트 (src/lib/negation.ts).
 * 실행: cd web && node --experimental-strip-types --no-warnings scripts/test-negation.mjs
 *
 * 각 줄: [문장, 키워드, 근거로 써야 하는가]
 */
import { negatedAt, negatedAtKo } from "../src/lib/negation.ts";

const EN = [
  // 실제로 본문 확인에서 '실험' 근거로 잘못 잡혔던 문장
  ["However, such an experimental setup could not be obtained in the present work.", "experimental", false],
  ["Numerical simulations were not performed because of the computational cost.", "simulations", false],
  ["The phase screen method cannot be applied to strong turbulence regimes.", "phase screen", false],
  ["An off-axis configuration was not possible with our camera.", "off-axis", false],
  ["Direct holographic measurement of the knot failed to resolve the vortex lines.", "holographic", false],
  ["A spatial light modulator was unable to provide sufficient phase depth.", "spatial light modulator", false],
  ["Experimental verification is impossible with current detectors.", "experimental", false],
  ["In the experiment, no spatial filter was used.", "spatial filter", false],
  ["This can occur by using a spatial light modulator in the Fourier plane.", "spatial light modulator", false],
  ["Digital holography could be used to measure such fields in the future.", "digital holography", false],
  ["Experimental realization will be the subject of future work.", "experimental", false],
  ["No experiment has been reported on knotted beams in turbulence.", "experiment", false],
  ["We studied the problem without simulation.", "simulation", false],
  // 실제 근거 (남아야 함)
  ["We experimentally generated optical vortex knots using a spatial light modulator.", "spatial light modulator", true],
  ["The complex field was measured by off-axis digital holography in a Mach-Zehnder interferometer.", "off-axis", true],
  ["Numerical simulations with random phase screens show that the knot survives weak turbulence.", "simulations", true],
  ["Experimental results agree with simulations, but no topology change was observed beyond z = 2 m.", "Experimental", true],
  ["We performed experiments using a 4f system, and no additional optics were required.", "4f system", true],
  ["Our off-axis holography does not require phase shifting.", "off-axis holography", true],
  ["Not only simulations but also experiments were performed.", "experiments", true],
  ["The hologram can be reconstructed numerically from a single shot.", "hologram", true],
  ["Unlike previous methods, our digital holography setup measures amplitude and phase.", "digital holography", true],
  ["Experiments were performed; however, the SLM could not be calibrated above 1 kHz.", "Experiments", true],
];

const KO = [
  ["이번 연구에서는 실험을 수행하지 못했다.", "실험", false],
  ["실험 없이 시뮬레이션만으로 분석하였다.", "실험", false],
  ["공간 광변조기를 이용한 실험은 장비 문제로 불가능하였다.", "공간 광변조기", false],
  ["향후 연구에서 디지털 홀로그래피를 적용할 계획이다.", "디지털 홀로그래피", false],
  ["공간 광변조기로 빔을 성형하고 디지털 홀로그래피로 위상을 측정하였다.", "디지털 홀로그래피", true],
  ["수치해석 결과 매듭 구조가 약한 난류에서 유지됨을 확인하였다.", "수치해석", true],
  ["실험을 통해 제안한 방법의 타당성을 검증하였다.", "실험", true],
  ["시뮬레이션을 수행하였고, 측정은 하지 못했다.", "시뮬레이션", true],
];

let fail = 0;
function check(list, fn, lang) {
  for (const [s, kw, want] of list) {
    const i = s.toLowerCase().indexOf(kw.toLowerCase());
    if (i < 0) throw new Error(`키워드가 문장에 없음: ${kw} / ${s}`);
    const usable = !fn(s, i, i + kw.length);
    const ok = usable === want;
    if (!ok) fail++;
    console.log(`${ok ? "PASS" : "FAIL"} [${lang}] ${want ? "근거" : "제외"} «${kw}» ${s}`);
  }
}
check(EN, negatedAt, "en");
check(KO, negatedAtKo, "ko");
console.log(fail ? `\n${fail}개 실패` : `\n모두 통과 (${EN.length + KO.length}개)`);
process.exit(fail ? 1 : 0);
