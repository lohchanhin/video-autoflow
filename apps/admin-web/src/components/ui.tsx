import type { ReactNode } from "react";

export function StatusPill(props: { children: ReactNode; tone?: "neutral" | "active" | "success" | "danger" | "warning" }) {
  return <span className={`status-pill ${props.tone ?? "neutral"}`}>{props.children}</span>;
}

export function EmptyState(props: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <strong>{props.title}</strong>
      <span>{props.body}</span>
    </div>
  );
}

export function SectionHeader(props: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="section-header">
      <div>
        <p className="eyebrow">{props.eyebrow}</p>
        <h2>{props.title}</h2>
      </div>
      {props.action ? <div className="section-action">{props.action}</div> : null}
    </div>
  );
}

export function Field(props: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <label className={`field ${props.className ?? ""}`.trim()}>
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}
