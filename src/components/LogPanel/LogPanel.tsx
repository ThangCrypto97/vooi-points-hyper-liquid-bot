import { useEffect, useRef, useState } from "react";
import styles from "./LogPanel.module.css";

type Props = {
  logs: string[];
  className?: string;
};

const AUTOSCROLL_THRESHOLD = 120;

export const LogPanel = ({ logs, className }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const isScrolling = useRef(false);

  const scrollToBottom = (smooth = true) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (autoScroll && !isScrolling.current) scrollToBottom();
  }, [logs, autoScroll]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < AUTOSCROLL_THRESHOLD;
      isScrolling.current = true;
      setAutoScroll(atBottom);
    };

    const onScrollEnd = () => {
      isScrolling.current = false;
    };
    el.addEventListener("scroll", onScroll);
    el.addEventListener("scrollend", onScrollEnd);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", onScrollEnd);
    };
  }, []);

  return (
    <div className={`${styles.logPanel} ${className ?? ""}`}>
      <div className={styles.header}>
        <div className={styles.title}>Logs</div>

        <div className={styles.toolbar}>
          <label className={styles.autoLabel}>
            <input
              className={styles.checkbox}
              type="checkbox"
              checked={autoScroll}
              onChange={() => setAutoScroll((v) => !v)}
            />
            Auto ⤓
          </label>
        </div>
      </div>

      <div ref={containerRef} className={styles.container}>
        {logs.length === 0 ? (
          <div className={styles.empty}>No logs yet</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={styles.entry}>
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LogPanel;
