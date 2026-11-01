import { useEffect, useRef } from "react";
import { mountFrame } from "./frame";

/** Read-only scaled frame preview (thumbnails, grid, picker). */
export function FrameView({ html, css, width, height, scale }: { html: string; css: string; width: number; height: number; scale: number }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (host.current) mountFrame(host.current, { html, css, width, height });
  }, [html, css, width, height]);
  return (
    <div style={{ width: width * scale, height: height * scale, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width, height, transform: `scale(${scale})`, transformOrigin: "0 0", pointerEvents: "none" }}>
        <div ref={host} />
      </div>
    </div>
  );
}
