import type { TranscriptSegment } from "@/lib/ytdlp";
import { NextRequest } from "next/server";

export interface Highlight {
  title: string;
  start: string; // "mm:ss" or "hh:mm:ss"
  end: string;
  reason: string;
}

const GEMINI_MODEL = "gemini-3.6-flash";
const CHUNK_CHAR_LIMIT = 10_000; // chars per Gemini call

/** Convert seconds to "mm:ss" or "h:mm:ss" */
function secondsToTimestamp(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Parse "mm:ss" or "h:mm:ss" back to seconds */
function timestampToSeconds(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + (parts[1] ?? 0);
}

/** Check if a highlight duration is between 15 and 30 minutes */
function isValidDuration(h: Highlight): boolean {
  const dur = timestampToSeconds(h.end) - timestampToSeconds(h.start);
  return dur >= 15 * 60 && dur <= 30 * 60;
}

/** Build a formatted transcript string from segments */
function buildTranscriptText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${secondsToTimestamp(s.start)} -> ${secondsToTimestamp(s.end)}] ${s.text}`)
    .join("\n");
}

/** Split segments into chunks that fit within the char limit */
function chunkSegments(segments: TranscriptSegment[]): TranscriptSegment[][] {
  const chunks: TranscriptSegment[][] = [];
  let current: TranscriptSegment[] = [];
  let currentLen = 0;

  for (const seg of segments) {
    const line = `[${secondsToTimestamp(seg.start)} -> ${secondsToTimestamp(seg.end)}] ${seg.text}\n`;
    if (currentLen + line.length > CHUNK_CHAR_LIMIT && current.length > 0) {
      chunks.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(seg);
    currentLen += line.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Call Gemini and extract highlights from one transcript chunk */
async function analyzeChunk(
  transcriptText: string,
  title: string,
  apiKey: string,
  isPartial: boolean
): Promise<Highlight[]> {
  const partialNote = isPartial
    ? "Este é um TRECHO do transcript (o vídeo é longo). Identifique os melhores momentos desta parte."
    : "";

  const prompt = `Você é um especialista em análise de conteúdo de vídeo e criação de clipes virais.

Analise o transcript abaixo do vídeo intitulado "${title}" e identifique de 3 a 5 dos MELHORES trechos para destacar.
${partialNote}

REGRA CRÍTICA DE DURAÇÃO: Cada trecho DEVE ter entre 15 e 30 minutos de duração.
Só defina o "start" e "end" de forma que (end - start) esteja entre 15:00 e 30:00 minutos.

Critérios para escolha dos trechos:
- Momentos de alto impacto emocional ou surpresa
- Insights únicos, revelações ou afirmações fortes
- Humor, ironia ou viradas inesperadas
- Frases memoráveis ou citáveis
- Momentos que gerariam curiosidade para quem não assistiu
- Valor informativo ou educacional concentrado

TRANSCRIPT:
${transcriptText}

Responda SOMENTE com um JSON válido neste formato exato (sem markdown, sem texto extra):
{
  "highlights": [
    {
      "title": "Título curto e chamativo do trecho (máx 6 palavras)",
      "start": "mm:ss",
      "end": "mm:ss",
      "reason": "Explicação em 1-2 frases do por que este trecho é especial"
    }
  ]
}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error("Gemini chunk error:", errText);
    throw new Error(`Gemini API retornou ${res.status}`);
  }

  const data = await res.json();
  const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  console.log("[analyze chunk]", rawText);

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { highlights: Highlight[] };
    const valid = (parsed.highlights ?? []).filter(isValidDuration);
    // If Gemini ignored the duration rule, return all and let pickBest handle it
    return valid.length > 0 ? valid : (parsed.highlights ?? []);
  } catch {
    return [];
  }
}

/** Final pass: pick the best 8 highlights from a merged list */
async function pickBest(
  allHighlights: Highlight[],
  title: string,
  apiKey: string
): Promise<Highlight[]> {
  const list = allHighlights
    .map((h, i) => `${i + 1}. [${h.start} -> ${h.end}] ${h.title}: ${h.reason}`)
    .join("\n");

  const prompt = `Você é um especialista em curadoria de conteúdo de vídeo.

Os candidatos abaixo foram extraídos de diferentes partes do vídeo "${title}".
Selecione os 6 a 8 MELHORES e mais VARIADOS highlights, evitando repetições de tema.

REGRA CRÍTICA DE DURAÇÃO: Cada trecho selecionado DEVE ter entre 15 e 30 minutos de duração.
Ajuste o "start" e "end" se necessário para garantir isso.

CANDIDATOS:
${list}

Responda SOMENTE com um JSON válido neste formato exato (sem markdown, sem texto extra):
{
  "highlights": [
    {
      "title": "Título curto e chamativo do trecho (máx 6 palavras)",
      "start": "mm:ss",
      "end": "mm:ss",
      "reason": "Explicação em 1-2 frases do por que este trecho é especial"
    }
  ]
}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    }
  );

  if (!res.ok) return allHighlights.slice(0, 8); // fallback: return first 8

  const data = await res.json();
  const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  console.log("[analyze pickBest]", rawText);

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return allHighlights.slice(0, 8);

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { highlights: Highlight[] };
    return parsed.highlights ?? allHighlights.slice(0, 8);
  } catch {
    return allHighlights.slice(0, 8);
  }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY não configurada no servidor." },
      { status: 500 }
    );
  }

  let body: { segments: TranscriptSegment[]; title: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido no corpo da requisição." }, { status: 400 });
  }

  const { segments, title } = body;

  if (!segments?.length) {
    return Response.json({ error: "Nenhum segmento de transcript fornecido." }, { status: 400 });
  }

  try {
    const chunks = chunkSegments(segments);
    const isMultiChunk = chunks.length > 1;

    console.log(`[analyze] ${chunks.length} chunk(s) para "${title}"`);

    // Analyze all chunks in parallel
    const chunkResults = await Promise.all(
      chunks.map((chunk) =>
        analyzeChunk(buildTranscriptText(chunk), title, apiKey, isMultiChunk).catch(
          () => [] as Highlight[]
        )
      )
    );

    const allHighlights = chunkResults.flat();

    if (allHighlights.length === 0) {
      return Response.json(
        { error: "Não foi possível identificar trechos no transcript." },
        { status: 502 }
      );
    }

    // If only one chunk, return directly; otherwise do a final curation pass
    const final =
      isMultiChunk && allHighlights.length > 8
        ? await pickBest(allHighlights, title, apiKey)
        : allHighlights;

    return Response.json({ highlights: final, chunks: chunks.length });
  } catch (err: unknown) {
    console.error("analyze route error:", err);
    const msg = err instanceof Error ? err.message : "Erro ao analisar transcript";
    return Response.json({ error: msg }, { status: 500 });
  }
}
