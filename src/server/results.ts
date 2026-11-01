import { VyybeError } from "../core/util.js";

export type ToolResult = {
  content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

export function ok(text: string, structured?: Record<string, unknown>, images: { data: Buffer; mime: string }[] = []): ToolResult {
  return {
    content: [{ type: "text", text }, ...images.map((i) => ({ type: "image" as const, data: i.data.toString("base64"), mimeType: i.mime }))],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

export function fail(err: unknown): ToolResult {
  if (err instanceof VyybeError) {
    return { isError: true, content: [{ type: "text", text: `${err.code}: ${err.message}${err.hint ? `\nHint: ${err.hint}` : ""}` }] };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: "text", text: `ERROR: ${msg}` }] };
}

export function wrap<A>(fn: (args: A, extra: any) => Promise<ToolResult> | ToolResult) {
  return async (args: A, extra: any): Promise<ToolResult> => {
    try {
      return await fn(args, extra);
    } catch (err) {
      if (process.env.VYYBE_DEBUG) console.error(err);
      return fail(err);
    }
  };
}

/**
 * For model-facing tools: some hosts (Claude Code) show structuredContent to the model *instead of*
 * the text content, so model tools return text (+ images) only.
 */
export function mwrap<A>(fn: (args: A, extra: any) => Promise<ToolResult> | ToolResult) {
  const inner = wrap(fn);
  return async (args: A, extra: any): Promise<ToolResult> => {
    const r = await inner(args, extra);
    delete r.structuredContent;
    return r;
  };
}
