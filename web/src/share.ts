/**
 * Page state <-> `?s=` query parameter.
 *
 * The state is JSON, compressed with deflate-raw and written as base64url, so
 * a typical model fits in a short, URL-safe string.
 */

export type Tab = "chart" | "table";

export interface PageState {
  /** Text of the model editor. */
  model: string;
  /** Raw value of the rounds input. */
  rounds: string;
  /** Stocks whose checkboxes are unchecked. */
  hidden: string[];
  tab: Tab;
}

export const PARAM = "s";

/** Bump when the shape changes; decoding rejects other versions. */
const VERSION = 1;

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function encodeState(state: PageState): Promise<string> {
  const json = JSON.stringify({ v: VERSION, ...state });
  return toBase64Url(await pipe(new TextEncoder().encode(json), new CompressionStream("deflate-raw")));
}

/** Returns null for anything that isn't a valid encoded state. */
export async function decodeState(encoded: string): Promise<PageState | null> {
  try {
    const bytes = await pipe(fromBase64Url(encoded), new DecompressionStream("deflate-raw"));
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof data !== "object" || data === null) return null;
    const d = data as Record<string, unknown>;
    if (d.v !== VERSION || typeof d.model !== "string") return null;
    return {
      model: d.model,
      rounds: typeof d.rounds === "string" ? d.rounds : "100",
      hidden: Array.isArray(d.hidden) ? d.hidden.filter((x): x is string => typeof x === "string") : [],
      tab: d.tab === "table" ? "table" : "chart",
    };
  } catch {
    return null;
  }
}
