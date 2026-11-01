import { useState } from "react";
import { FrameView } from "../FrameView";
import { Icon } from "../Icon";
import type { FrameData } from "./Studio";

export function Filmstrip({ frames, css, activeId, onSelect, onReorder, onDuplicate, onDelete }: {
  frames: FrameData[];
  css: string;
  activeId: string | null;
  onSelect: (id: string) => void;
  onReorder: (order: string[]) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const H = 80;

  const finish = () => {
    if (dragId !== null && dropAt !== null) {
      const ids = frames.map((f) => f.id);
      const from = ids.indexOf(dragId);
      ids.splice(from, 1);
      ids.splice(dropAt > from ? dropAt - 1 : dropAt, 0, dragId);
      if (ids.join() !== frames.map((f) => f.id).join()) onReorder(ids);
    }
    setDragId(null);
    setDropAt(null);
  };

  return (
    <div className="vy-strip" onDragOver={(e) => e.preventDefault()} onDrop={finish}>
      {frames.map((f, i) => {
        const scale = H / f.height;
        return (
          <div key={f.id} style={{ display: "contents" }}>
            {dropAt === i && dragId && <div className="vy-drop-marker" />}
            <div
              className={`vy-thumb ${f.id === activeId ? "active" : ""} ${dragId === f.id ? "dragging" : ""}`}
              draggable
              onDragStart={(e) => {
                setDragId(f.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", f.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setDropAt(e.clientX < r.left + r.width / 2 ? i : i + 1);
              }}
              onDragEnd={finish}
              onClick={() => onSelect(f.id)}
              title={`${i + 1}. ${f.name}`}
            >
              <span className="num">{i + 1}</span>
              <div className="menu" onClick={(e) => e.stopPropagation()}>
                <button title="Duplicate" onClick={() => onDuplicate(f.id)}><Icon name="copy" /></button>
                {frames.length > 1 && <button title="Delete" onClick={() => onDelete(f.id)}><Icon name="trash-2" /></button>}
              </div>
              <div className="clip"><FrameView html={f.html} css={css} width={f.width} height={f.height} scale={scale} /></div>
            </div>
          </div>
        );
      })}
      {dropAt === frames.length && dragId && <div className="vy-drop-marker" />}
    </div>
  );
}
