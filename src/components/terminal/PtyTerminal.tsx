import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export default function PtyTerminal({ shell, cwd }: { shell?: string; cwd?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<any | null>(null);
  const fitRef = useRef<any | null>(null);
  const ptyIdRef = useRef<number | null>(null);
  const unlistenRef = useRef<any | null>(null);

  useEffect(() => {
    const term = new Terminal({ convertEol: true, cursorBlink: true });
    const fit = new FitAddon();
    term.loadAddon(fit);
    termRef.current = term;
    fitRef.current = fit;

    if (containerRef.current) {
      term.open(containerRef.current);
      fit.fit();
    }

    let mounted = true;

    // Spawn PTY on backend
    (async () => {
      try {
        const cols = term.cols;
        const rows = term.rows;
        const id = (await invoke("spawn_pty", { shell: shell ?? "", cols, rows, cwd: cwd ?? null })) as number;
        ptyIdRef.current = id;

        // listen for output
        const unlisten = await listen("pty-output", (e: any) => {
          const payload: any = e.payload;
          if (!mounted) return;
          if (payload && payload.id === id) {
            term.write(payload.data);
          }
        });
        unlistenRef.current = unlisten;

        // send terminal input to backend
        term.onData((d: string) => {
          if (ptyIdRef.current != null) {
            invoke("pty_write", { id: ptyIdRef.current, data: d }).catch((err: unknown) => console.error(err));
          }
        });

        // fit on resize observer
        const ro = new ResizeObserver(() => {
          if (!containerRef.current) return;
          fit.fit();
          const c = term.cols;
          const r = term.rows;
          if (ptyIdRef.current != null) invoke("pty_resize", { id: ptyIdRef.current, cols: c, rows: r }).catch((err: unknown) => console.error(err));
        });
        if (containerRef.current) ro.observe(containerRef.current);

        // cleanup observer on unmount
        return () => {
          mounted = false;
          ro.disconnect();
        };
      } catch (err) {
        console.error("Failed to spawn PTY:", err);
      }
    })();

    return () => {
      // cleanup
      (async () => {
        try {
          if (unlistenRef.current) {
            await unlistenRef.current();
            unlistenRef.current = null;
          }
        } catch (e) {
          console.warn(e);
        }

        if (ptyIdRef.current != null) {
          try {
            await invoke("pty_kill", { id: ptyIdRef.current });
          } catch (e) {
            console.warn(e);
          }
          ptyIdRef.current = null;
        }

        if (termRef.current) {
          termRef.current.dispose();
          termRef.current = null;
        }
      })();
    };
  }, [shell]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
