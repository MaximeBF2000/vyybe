import fs from "node:fs";
import path from "node:path";
import { lib, ensureDir } from "./paths.js";
import { readJson, writeJson, shortId, nowIso, VyybeError } from "./util.js";
import type { Theme } from "./theme.js";

export interface PickerOption {
  id: string;
  label: string;
  description?: string;
  /** Frame HTML preview (fragment). */
  html?: string;
  theme?: Theme;
  width?: number;
  height?: number;
  /** Style preset id this option represents. */
  styleId?: string;
  /** Saved branding this option represents. */
  brandingId?: string;
}

export interface Picker {
  id: string;
  title: string;
  question?: string;
  multiple: boolean;
  projectId?: string;
  options: PickerOption[];
  createdAt: string;
  answer?: { selected: string[]; note?: string; at: string };
}

const file = (id: string) => {
  if (!/^pk[a-f0-9]{8}$/.test(id)) throw new VyybeError("PICKER_NOT_FOUND", `Unknown picker "${id}".`);
  return path.join(lib.pickers(), `${id}.json`);
};

export function createPicker(input: Omit<Picker, "id" | "createdAt">): Picker {
  ensureDir(lib.pickers());
  const p: Picker = { ...input, id: shortId("pk"), createdAt: nowIso() };
  writeJson(file(p.id), p);
  // keep the folder small
  const all = fs.readdirSync(lib.pickers()).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 50))) fs.rmSync(path.join(lib.pickers(), old), { force: true });
  return p;
}

export function loadPicker(id: string): Picker {
  const f = file(id);
  if (!fs.existsSync(f)) throw new VyybeError("PICKER_NOT_FOUND", `Unknown picker "${id}".`);
  return readJson<Picker>(f);
}

export function answerPicker(id: string, selected: string[], note?: string): Picker {
  const p = loadPicker(id);
  p.answer = { selected, note, at: nowIso() };
  writeJson(file(id), p);
  return p;
}
