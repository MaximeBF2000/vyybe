import dns from "node:dns/promises";
import net from "node:net";
import { VyybeError } from "./util.js";

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new VyybeError("BAD_URL", `Not a valid URL: ${raw.slice(0, 100)}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new VyybeError("BAD_URL", "Only http(s) URLs can be downloaded.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(isPrivateIp)) throw new VyybeError("BLOCKED_URL", `Refusing to download from a local/private address (${host}).`);
  return url;
}

/** Download a public URL with redirect validation and a size cap. */
export async function fetchRemote(raw: string, maxBytes: number, headers: Record<string, string> = {}): Promise<{ buf: Buffer; mime: string }> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": "Vyybe/0.1 (+local creative studio)", ...headers }, signal: AbortSignal.timeout(30000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) throw new VyybeError("DOWNLOAD_FAILED", `Download failed: HTTP ${res.status}.`);
    const len = Number(res.headers.get("content-length") || 0);
    if (len > maxBytes) throw new VyybeError("ASSET_TOO_LARGE", `File is too large (${(len / 1e6).toFixed(1)} MB).`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new VyybeError("ASSET_TOO_LARGE", "File is too large.");
    return { buf, mime: res.headers.get("content-type") ?? "" };
  }
  throw new VyybeError("DOWNLOAD_FAILED", "Too many redirects.");
}
