import { useEffect, useRef, useState } from "react";
import type { Transport } from "./transport";
import { registerFonts } from "./frame";
import { FrameView } from "./FrameView";
import { Icon } from "./Icon";

interface Opt { id: string; label: string; description?: string; width: number; height: number; html: string; css: string }

export function Picker({ t, pickerId, initialData }: { t: Transport; pickerId: string; initialData?: any }) {
  const [data, setData] = useState<{ picker: { title: string; question?: string; multiple: boolean; answer?: any }; options: Opt[] } | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "saved">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [cell, setCell] = useState(220);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const r: any = initialData ?? (await t.call("picker_load", { pickerId }));
        await registerFonts(r.fonts ?? []);
        setData(r);
        if (r.picker.answer) {
          setSel(r.picker.answer.selected);
          setState("sent");
        }
      } catch (e: any) {
        setErr(e.message);
      }
    })();
  }, [t, pickerId]);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const w = gridRef.current?.clientWidth ?? 600;
      const n = data?.options.length ?? 3;
      const cols = Math.max(1, Math.min(n <= 4 ? n : 3, Math.floor((w + 16) / 190)));
      setCell((w - (cols - 1) * 16) / cols - 22);
    });
    if (gridRef.current) ro.observe(gridRef.current);
    return () => ro.disconnect();
  }, [data]);

  if (err) return <div className="vy-center">{err}</div>;
  if (!data) return <div className="vy-center"><div><div className="vy-spinner" />Preparing options…</div></div>;

  const toggle = (id: string) => {
    if (state === "sent") return;
    setSel((s) => (data.picker.multiple ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));
  };

  const submit = async () => {
    if (!sel.length) return;
    setState("sending");
    try {
      // Recording the choice server-side is a bonus; the chat message is what matters.
      await t.call("picker_submit", { pickerId, selected: sel, note: note || undefined }).catch(() => null);
      const chosen = data.options.filter((o) => sel.includes(o.id));
      const text = `I pick ${chosen.map((o) => `"${o.label}" (${o.id})`).join(" and ")}.${note ? ` Note: ${note}` : ""}`;
      const sent = t.sendMessage ? await t.sendMessage(text) : false;
      setState(sent ? "sent" : "saved");
    } catch (e: any) {
      setErr(e.message);
      setState("idle");
    }
  };

  const maxH = Math.max(...data.options.map((o) => o.height / o.width));

  return (
    <>
      <div className="vy-picker">
        <div>
          <h2>{data.picker.title}</h2>
        </div>
        {data.picker.question && <div className="q">{data.picker.question}</div>}
        <div className="vy-options" ref={gridRef} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(170, cell)}px, 1fr))` }}>
          {data.options.map((o) => {
            const s = cell / o.width;
            return (
              <div key={o.id} className={`vy-option ${sel.includes(o.id) ? "selected" : ""}`} onClick={() => toggle(o.id)}>
                <div className="pv" style={{ height: cell * maxH, display: "grid", placeItems: "center" }}>
                  {o.html ? <FrameView html={o.html} css={o.css} width={o.width} height={o.height} scale={s} /> : null}
                </div>
                <div className="lbl">
                  <span className="vy-check">{sel.includes(o.id) && <Icon name="check" />}</span>
                  {o.label}
                </div>
                {o.description && <div className="desc">{o.description}</div>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="vy-picker-foot">
        {state === "sent" ? (
          <div className="vy-hint" style={{ flex: 1 }}><Icon name="check" size={14} /> Choice sent to the assistant.</div>
        ) : state === "saved" ? (
          <div className="vy-hint" style={{ flex: 1 }}>Tell the assistant: “I pick {data.options.filter((o) => sel.includes(o.id)).map((o) => o.label).join(" and ")}”{note ? ` — ${note}` : ""}.</div>
        ) : (
          <>
            <input placeholder="Anything to tweak? (optional)" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
            <button className="vy-btn primary" disabled={!sel.length || state === "sending"} onClick={submit}>
              {state === "sending" ? "Sending…" : data.picker.multiple ? `Use ${sel.length || ""} selected` : "Use this one"}
            </button>
          </>
        )}
      </div>
    </>
  );
}
