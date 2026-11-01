import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { registerTools, appHandlers, VERSION } from "./tools.js";
import { setHttpHandlers } from "./http.js";
import { shutdownChrome } from "../core/chrome.js";

const INSTRUCTIONS = `Vyybe turns ideas into on-brand marketing visuals (Instagram/LinkedIn carousels, posts, stories, YouTube thumbnails, ads, slides, banners).
Frames are HTML+Tailwind fragments rendered on a fixed canvas; Vyybe handles fonts, icons, brand tokens, rendering, checks, editing and export.
Always follow the "vyybe" skill workflow when creating or editing visuals. Typical flow: vyybe_status → (create_project with all frames | write_frames) → fix issues from the preview → open_studio.`;

// Avoid crashing the stdio connection on stray errors: log to stderr only.
process.on("uncaughtException", (e) => console.error("[vyybe] uncaught", e));
process.on("unhandledRejection", (e) => console.error("[vyybe] unhandled", e));

const server = new McpServer({ name: "vyybe", version: VERSION, title: "Vyybe" } as any, { capabilities: { tools: {}, resources: {} }, instructions: INSTRUCTIONS } as any);
registerTools(server);
setHttpHandlers(() => appHandlers());

const transport = new StdioServerTransport();
await server.connect(transport);

const stop = () => {
  shutdownChrome();
  process.exit(0);
};
process.stdin.on("close", stop);
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
