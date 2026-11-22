/**
 * 결과를 파일로 저장하는 작은 캐시. 서버를 재시작해도 남아서, 같은 입력은 같은 결과가 나온다
 * (검색어가 실행마다 달라 순위가 흔들리는 문제 → 데모·비교 때 결과 고정).
 * 위치: LABFIT_CACHE_DIR 또는 <cwd>/.cache. 쓰기 실패는 무시한다 (캐시는 선택 사항).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.env.LABFIT_CACHE_DIR ?? path.join(process.cwd(), ".cache");

// 캐시 경로는 실행 시점에만 정해진다. 빌드가 프로젝트 전체를 추적하지 않도록 ignore 표시
const dir = (ns: string) => path.join(/*turbopackIgnore: true*/ ROOT, ns);

export function cacheKey(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

export async function readCache<T>(ns: string, key: string): Promise<{ value: T; savedAt: string } | null> {
  try {
    return JSON.parse(await readFile(path.join(dir(ns), `${key}.json`), "utf8"));
  } catch {
    return null;
  }
}

export async function writeCache(ns: string, key: string, value: unknown): Promise<void> {
  try {
    await mkdir(dir(ns), { recursive: true });
    await writeFile(path.join(dir(ns), `${key}.json`), JSON.stringify({ value, savedAt: new Date().toISOString() }));
  } catch (e) {
    console.error("[cache] write failed", e instanceof Error ? e.message : e);
  }
}

const memory = new Map<string, unknown>();

/**
 * 메모리 → 파일 순으로 찾고, 없으면 compute 결과를 저장한다.
 * keep(v)가 false인 결과(실패 응답 등)는 저장하지 않아 다음 요청에서 다시 시도한다.
 */
export async function cached<T>(ns: string, input: unknown, compute: () => Promise<T>, keep: (v: T) => boolean = () => true): Promise<T> {
  const key = cacheKey(input);
  const mk = `${ns}/${key}`;
  if (memory.has(mk)) return memory.get(mk) as T;
  const hit = await readCache<T>(ns, key);
  if (hit) {
    memory.set(mk, hit.value);
    return hit.value;
  }
  const value = await compute();
  if (keep(value)) {
    memory.set(mk, value);
    await writeCache(ns, key, value);
  }
  return value;
}

/** compute를 건너뛰고 값을 직접 저장 (새로 계산한 결과로 덮어쓸 때). 메모리 캐시도 같이 바꾼다 */
export async function putCache(ns: string, input: unknown, value: unknown): Promise<void> {
  const key = cacheKey(input);
  memory.set(`${ns}/${key}`, value);
  await writeCache(ns, key, value);
}
