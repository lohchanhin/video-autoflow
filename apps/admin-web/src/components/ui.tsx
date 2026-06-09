import { useEffect, useState, type ReactNode } from "react";
import { Image as ImageIcon } from "lucide-react";

export type MediaImageLoadState = {
  src: string;
  status: "empty" | "loading" | "loaded" | "failed";
};

export function getMediaImageCurrentStatus(src: string, state: MediaImageLoadState): MediaImageLoadState["status"] {
  if (state.src === src) {
    return state.status;
  }

  return src ? "loading" : "empty";
}

export function canRenderMediaImage(src: string, state: MediaImageLoadState): boolean {
  return Boolean(src) && state.src === src && state.status === "loaded";
}

export function hasRenderableImageDimensions(image: Pick<HTMLImageElement, "naturalHeight" | "naturalWidth">): boolean {
  return image.naturalWidth > 0 && image.naturalHeight > 0;
}

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

export function MediaFallback(props: {
  className?: string | undefined;
  iconSize?: number | undefined;
  label?: string | undefined;
  status?: "empty" | "failed" | "loading";
}) {
  const status = props.status ?? "empty";
  const label = props.label ?? (status === "loading" ? "加载中" : status === "failed" ? "预览失效" : "暂无预览");

  return (
    <div className={`media-fallback ${status === "loading" ? "loading" : ""} ${props.className ?? ""}`.trim()} title={label}>
      <ImageIcon size={props.iconSize ?? 22} />
      <span>{label}</span>
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

export function MediaImage(props: {
  alt: string;
  className?: string;
  fallbackLabel?: string;
  src: string | null | undefined;
}) {
  const src = (props.src ?? "").trim();
  const [state, setState] = useState<MediaImageLoadState>({
    src,
    status: src ? "loading" : "empty"
  });
  const currentStatus = getMediaImageCurrentStatus(src, state);
  const isLoadedCurrentSrc = canRenderMediaImage(src, state);

  useEffect(() => {
    if (!src) {
      setState({ src: "", status: "empty" });
      return;
    }

    let active = true;
    const image = new Image();

    setState({ src, status: "loading" });
    image.onload = () => {
      if (active) setState({ src, status: hasRenderableImageDimensions(image) ? "loaded" : "failed" });
    };
    image.onerror = () => {
      if (active) setState({ src, status: "failed" });
    };
    image.src = src;

    return () => {
      active = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [src]);

  if (!isLoadedCurrentSrc) {
    return (
      <MediaFallback
        className={props.className}
        label={currentStatus === "loading" ? "加载中" : props.fallbackLabel ?? "预览不可用"}
        status={currentStatus === "loading" ? "loading" : currentStatus === "failed" ? "failed" : "empty"}
      />
    );
  }

  return (
    <img
      alt={props.alt}
      className={props.className}
      decoding="async"
      loading="lazy"
      src={src}
      onError={() => setState({ src, status: "failed" })}
    />
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
