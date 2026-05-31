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

export function EditableActionBar(props: {
  cancelLabel?: string;
  disabled?: boolean;
  isDirty: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  savedMessage?: string | null | undefined;
}) {
  return (
    <div className="editable-action-bar">
      <span className={`draft-state-pill ${props.isDirty ? "dirty" : "clean"}`}>
        {props.isDirty ? "未保存修改" : props.savedMessage ?? "已保存"}
      </span>
      <div>
        <button className="secondary-button compact-button" disabled={!props.isDirty} type="button" onClick={props.onCancel}>
          {props.cancelLabel ?? "取消修改"}
        </button>
        <button className="primary-button compact-button" disabled={!props.isDirty || props.disabled} type="button" onClick={props.onSave}>
          {props.saveLabel ?? "保存修改"}
        </button>
      </div>
    </div>
  );
}
