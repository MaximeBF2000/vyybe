import { z } from "zod";

export const FontSpecSchema = z.object({
  family: z.string().min(1).max(80).describe("Google Fonts family (auto-downloaded)"),
  weights: z.array(z.number().int().min(100).max(900)).max(9).optional(),
  italic: z.boolean().optional(),
  source: z.enum(["google", "system"]).optional(),
});
export type FontSpec = z.infer<typeof FontSpecSchema>;

const colorValue = z.string().min(1).max(120);

export const ThemeSchema = z.object({
  colors: z
    .record(z.string().regex(/^[a-z][a-z0-9-]{0,30}$/), colorValue)
    .describe("name → color; becomes bg-<name>/text-<name>… (background, surface, text, muted, primary, secondary, accent)"),
  fonts: z
    .record(z.string().regex(/^[a-z][a-z0-9-]{0,20}$/), FontSpecSchema)
    .describe("role → font; becomes font-<role> (display, body, mono)"),
  radius: z.string().max(20).optional().describe("→ rounded-brand"),
  css: z.string().max(20000).optional().describe("extra CSS shared by all frames (rarely needed)"),
});
export type Theme = z.infer<typeof ThemeSchema>;

export const DEFAULT_THEME: Theme = {
  colors: {
    background: "#0E0E10",
    surface: "#1A1A1F",
    text: "#F5F5F2",
    muted: "#9A9AA3",
    primary: "#FF4D2E",
    secondary: "#2E6BFF",
    accent: "#E8FF59",
  },
  fonts: {
    display: { family: "Inter Tight", weights: [600, 800, 900] },
    body: { family: "Inter", weights: [400, 500, 700] },
    mono: { family: "JetBrains Mono", weights: [400, 700] },
  },
  radius: "28px",
};

const FALLBACKS: Record<string, string> = {
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
  serif: "ui-serif, Georgia, serif",
  default: "ui-sans-serif, system-ui, sans-serif",
};

export function fontStack(role: string, spec: FontSpec): string {
  const fallback = role.includes("mono") ? FALLBACKS.mono : role.includes("serif") ? FALLBACKS.serif : FALLBACKS.default;
  return `"${spec.family.replace(/"/g, "")}", ${fallback}`;
}

/** The Tailwind entry stylesheet for a theme. */
export function themeToTailwindCss(theme: Theme): string {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(theme.colors)) lines.push(`  --color-${name}: ${sanitizeCssValue(value)};`);
  for (const [role, spec] of Object.entries(theme.fonts)) lines.push(`  --font-${role}: ${fontStack(role, spec)};`);
  if (theme.radius) lines.push(`  --radius-brand: ${sanitizeCssValue(theme.radius)};`);
  return `@import "tailwindcss";\n@theme {\n${lines.join("\n")}\n}\n`;
}

function sanitizeCssValue(v: string): string {
  return v.replace(/[;{}<>]/g, "").replace(/url\s*\(/gi, "").trim();
}

/** Short human-readable summary used in tool results. */
export function describeTheme(theme: Theme): string {
  const colors = Object.entries(theme.colors).map(([k, v]) => `${k} ${v}`).join(", ");
  const fonts = Object.entries(theme.fonts).map(([k, f]) => `font-${k}: ${f.family}${f.weights ? ` (${f.weights.join("/")})` : ""}`).join(", ");
  return `Colors → ${colors}. Fonts → ${fonts}.${theme.radius ? ` rounded-brand = ${theme.radius}.` : ""}`;
}

export function mergeTheme(base: Theme, patch?: Partial<Theme>): Theme {
  if (!patch) return structuredClone(base);
  return {
    colors: { ...base.colors, ...(patch.colors ?? {}) },
    fonts: { ...base.fonts, ...(patch.fonts ?? {}) },
    radius: patch.radius ?? base.radius,
    css: patch.css ?? base.css,
  };
}
