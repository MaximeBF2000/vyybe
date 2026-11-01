import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lib, ensureDir } from "./paths.js";
import { readJson, writeFileAtomic } from "./util.js";

const execFileP = promisify(execFile);

/**
 * API keys for optional providers. Stored in the macOS Keychain when available,
 * otherwise in ~/Vyybe/.vyybe/credentials.json with owner-only permissions.
 * Environment variables always win (useful for developers / CI).
 */
export const PROVIDERS = {
  openai: { label: "OpenAI (GPT Image)", env: ["OPENAI_API_KEY"], kind: "image", url: "https://platform.openai.com/api-keys" },
  gemini: { label: "Google Gemini (Nano Banana)", env: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], kind: "image", url: "https://aistudio.google.com/apikey" },
  fal: { label: "fal.ai (FLUX, Recraft, Ideogram…)", env: ["FAL_KEY", "FAL_API_KEY"], kind: "image", url: "https://fal.ai/dashboard/keys" },
  replicate: { label: "Replicate", env: ["REPLICATE_API_TOKEN"], kind: "image", url: "https://replicate.com/account/api-tokens" },
  pexels: { label: "Pexels (free stock photos)", env: ["PEXELS_API_KEY"], kind: "photo", url: "https://www.pexels.com/api/new/" },
  unsplash: { label: "Unsplash (free stock photos)", env: ["UNSPLASH_ACCESS_KEY"], kind: "photo", url: "https://unsplash.com/oauth/applications" },
} as const;

export type ProviderId = keyof typeof PROVIDERS;

const SERVICE = "vyybe";
const useKeychain = process.platform === "darwin" && process.env.VYYBE_NO_KEYCHAIN !== "1";
const memo = new Map<ProviderId, string | null>();

export async function getKey(provider: ProviderId): Promise<string | null> {
  for (const name of PROVIDERS[provider].env) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  if (memo.has(provider)) return memo.get(provider)!;
  let value: string | null = null;
  if (useKeychain) {
    try {
      const { stdout } = await execFileP("security", ["find-generic-password", "-s", SERVICE, "-a", provider, "-w"]);
      value = stdout.trim() || null;
    } catch {}
  }
  if (!value) value = readJson<Record<string, string>>(lib.credentials(), {})[provider] ?? null;
  memo.set(provider, value);
  return value;
}

export async function setKey(provider: ProviderId, key: string | null): Promise<"keychain" | "file" | "removed"> {
  memo.delete(provider);
  if (useKeychain) {
    try {
      await execFileP("security", ["delete-generic-password", "-s", SERVICE, "-a", provider]).catch(() => {});
      if (!key) return "removed";
      await execFileP("security", ["add-generic-password", "-s", SERVICE, "-a", provider, "-l", `Vyybe – ${PROVIDERS[provider].label}`, "-w", key, "-U"]);
      removeFromFile(provider);
      return "keychain";
    } catch {}
  }
  const creds = readJson<Record<string, string>>(lib.credentials(), {});
  if (key) creds[provider] = key;
  else delete creds[provider];
  ensureDir(lib.internal());
  writeFileAtomic(lib.credentials(), JSON.stringify(creds, null, 2), 0o600);
  fs.chmodSync(lib.credentials(), 0o600);
  return key ? "file" : "removed";
}

function removeFromFile(provider: ProviderId) {
  const creds = readJson<Record<string, string>>(lib.credentials(), {});
  if (provider in creds) {
    delete creds[provider];
    writeFileAtomic(lib.credentials(), JSON.stringify(creds, null, 2), 0o600);
  }
}

export async function providerStatus(): Promise<Record<ProviderId, boolean>> {
  const out = {} as Record<ProviderId, boolean>;
  for (const id of Object.keys(PROVIDERS) as ProviderId[]) out[id] = !!(await getKey(id));
  return out;
}

export interface VyybeConfig {
  /** Preferred image provider; "auto" walks the waterfall. */
  imageProvider?: "auto" | "openai" | "gemini" | "fal" | "replicate";
  imageModels?: Partial<Record<"openai" | "gemini" | "fal" | "replicate", string>>;
  photoProvider?: "auto" | "pexels" | "unsplash" | "openverse";
}

export function readConfig(): VyybeConfig {
  return readJson<VyybeConfig>(lib.config(), {});
}

export function writeConfig(patch: VyybeConfig): VyybeConfig {
  const next = { ...readConfig(), ...patch, imageModels: { ...(readConfig().imageModels ?? {}), ...(patch.imageModels ?? {}) } };
  ensureDir(lib.internal());
  writeFileAtomic(lib.config(), JSON.stringify(next, null, 2));
  return next;
}
