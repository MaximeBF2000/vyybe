#!/bin/sh
# Vyybe MCP server launcher (macOS / Linux).
# Finds a Node.js >= 22 runtime; if none is installed, downloads a private copy of the
# official Node.js build (checksum-verified) into ~/Vyybe/.vyybe/runtime. Logs go to stderr only:
# stdout is reserved for the MCP protocol.

DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_VERSION="v24.22.1"
VYYBE_HOME="${VYYBE_HOME:-$HOME/Vyybe}"
RUNTIME="$VYYBE_HOME/.vyybe/runtime"

log() { echo "[vyybe] $*" >&2; }

ok_node() {
  [ -x "$1" ] || return 1
  major=$("$1" -e 'process.stdout.write(String(process.versions.node.split(".")[0]))' 2>/dev/null) || return 1
  [ "${major:-0}" -ge 22 ] 2>/dev/null
}

find_node() {
  # 1. explicit override, PATH and common install locations
  for c in "$VYYBE_NODE" "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node \
           "$HOME/.volta/bin/node" "$HOME/.local/share/fnm/aliases/default/bin/node" "$HOME/.asdf/shims/node" \
           "$HOME/.local/bin/node"; do
    [ -n "$c" ] && ok_node "$c" && { echo "$c"; return 0; }
  done
  # 2. nvm installs, newest first
  if [ -d "$HOME/.nvm/versions/node" ]; then
    for c in $(ls -1d "$HOME"/.nvm/versions/node/v* 2>/dev/null | sort -rV 2>/dev/null || ls -1d "$HOME"/.nvm/versions/node/v* | sort -r); do
      ok_node "$c/bin/node" && { echo "$c/bin/node"; return 0; }
    done
  fi
  # 3. Node runtimes bundled with host apps
  for c in /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node /Applications/Codex.app/Contents/Resources/cua_node/bin/node; do
    ok_node "$c" && { echo "$c"; return 0; }
  done
  # 4. our private runtime
  for c in "$RUNTIME"/node-*/bin/node; do
    ok_node "$c" && { echo "$c"; return 0; }
  done
  return 1
}

install_node() {
  os=$(uname -s); arch=$(uname -m)
  case "$os" in Darwin) os=darwin ;; Linux) os=linux ;; *) log "Unsupported OS $os"; return 1 ;; esac
  case "$arch" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) log "Unsupported CPU $arch"; return 1 ;; esac
  name="node-$NODE_VERSION-$os-$arch"
  url="https://nodejs.org/dist/$NODE_VERSION/$name.tar.gz"
  mkdir -p "$RUNTIME" || return 1
  log "Node.js 22+ not found — downloading a private runtime ($name, ~50 MB)…"
  tmp="$RUNTIME/$name.tar.gz"
  curl -fsSL "$url" -o "$tmp" || { log "Download failed: $url"; return 1; }
  expected=$(curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" | grep " $name.tar.gz\$" | cut -d' ' -f1)
  actual=$(shasum -a 256 "$tmp" 2>/dev/null | cut -d' ' -f1 || sha256sum "$tmp" | cut -d' ' -f1)
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    log "Checksum mismatch for $name — refusing to use it."; rm -f "$tmp"; return 1
  fi
  tar -xzf "$tmp" -C "$RUNTIME" && rm -f "$tmp"
  [ "$os" = darwin ] && xattr -dr com.apple.quarantine "$RUNTIME/$name" 2>/dev/null
  echo "$RUNTIME/$name/bin/node"
}

NODE="$(find_node)" || NODE="$(install_node)" || {
  log "Vyybe needs Node.js 22 or newer. Install it from https://nodejs.org and restart the app."
  exit 1
}

export VYYBE_PLUGIN_ROOT="$(cd "$DIR/.." && pwd)"
exec "$NODE" "$DIR/vyybe.mjs" "$@"
