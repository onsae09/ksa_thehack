const MODEL = "voyage-3.5";

async function embed(texts: string[], inputType: "query" | "document"): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY가 설정되지 않았습니다.");
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ input: texts, model: MODEL, input_type: inputType }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** 여러 query 각각과 각 문서의 코사인 유사도. 문서 임베딩은 한 번만 계산한다. result[q][d] */
export async function similarities(queries: string[], docs: string[]): Promise<number[][]> {
  const BATCH = 128;
  const [qs, ...batches] = await Promise.all([
    embed(queries, "query"),
    ...Array.from({ length: Math.ceil(docs.length / BATCH) }, (_, i) =>
      embed(docs.slice(i * BATCH, (i + 1) * BATCH), "document"),
    ),
  ]);
  const ds = batches.flat();
  return qs.map((q) => ds.map((d) => cosine(q, d)));
}
