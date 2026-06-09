import { useEffect, useRef, useState, type ReactNode } from "react";
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

export function getMediaImageSourcesStatus(sources: string[], state: MediaImageLoadState): MediaImageLoadState["status"] {
  if (sources.length === 0) {
    return "empty";
  }

  return sources.includes(state.src) ? state.status : "loading";
}

export function canRenderMediaImage(src: string, state: MediaImageLoadState): boolean {
  return Boolean(src) && state.src === src && state.status === "loaded";
}

export function canRenderMediaImageFromSources(sources: string[], state: MediaImageLoadState): boolean {
  return state.status === "loaded" && sources.includes(state.src);
}

export function hasRenderableImageDimensions(image: Pick<HTMLImageElement, "naturalHeight" | "naturalWidth">): boolean {
  return image.naturalWidth > 0 && image.naturalHeight > 0;
}

export function normalizeMediaImageSources(src: string | string[] | null | undefined): string[] {
  const rawSources = Array.isArray(src) ? src : [src];
  const seen = new Set<string>();
  const sources: string[] = [];

  for (const rawSource of rawSources) {
    const source = (rawSource ?? "").trim();

    if (!source || seen.has(source)) {
      continue;
    }

    seen.add(source);
    sources.push(source);
  }

  return sources;
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
  onUnavailable?: () => void;
  src: string | string[] | null | undefined;
}) {
  const sources = normalizeMediaImageSources(props.src);
  const sourceKey = sources.join("\n");
  const [state, setState] = useState<MediaImageLoadState>({
    src: sources[0] ?? "",
    status: sources.length > 0 ? "loading" : "empty"
  });
  const onUnavailableRef = useRef(props.onUnavailable);
  const notifiedUnavailableSourceKey = useRef("");

  useEffect(() => {
    onUnavailableRef.current = props.onUnavailable;
  }, [props.onUnavailable]);
  const currentStatus = getMediaImageSourcesStatus(sources, state);
  const isLoadedCurrentSrc = canRenderMediaImageFromSources(sources, state);
  const loadedSrc = isLoadedCurrentSrc ? state.src : "";

  useEffect(() => {
    notifiedUnavailableSourceKey.current = "";

    if (sources.length === 0) {
      setState({ src: "", status: "empty" });
      return;
    }

    let active = true;
    let image: HTMLImageElement | null = null;

    function tryLoad(index: number) {
      const candidate = sources[index];

      if (!candidate) {
        setState({ src: sources[sources.length - 1] ?? "", status: "failed" });
        if (sourceKey && notifiedUnavailableSourceKey.current !== sourceKey) {
          notifiedUnavailableSourceKey.current = sourceKey;
          onUnavailableRef.current?.();
        }
        return;
      }

      image = new Image();
      setState({ src: candidate, status: "loading" });
      image.onload = () => {
        if (!active || !image) return;

        if (hasRenderableImageDimensions(image)) {
          setState({ src: candidate, status: "loaded" });
          return;
        }

        tryLoad(index + 1);
      };
      image.onerror = () => {
        if (active) tryLoad(index + 1);
      };
      image.src = candidate;
    }

    tryLoad(0);

    return () => {
      active = false;
      if (image) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [sourceKey]);

  function markRenderedImageUnavailable() {
    setState({ src: loadedSrc, status: "failed" });
    if (sourceKey && notifiedUnavailableSourceKey.current !== sourceKey) {
      notifiedUnavailableSourceKey.current = sourceKey;
      onUnavailableRef.current?.();
    }
  }

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
      src={loadedSrc}
      onError={(event) => {
        event.currentTarget.removeAttribute("src");
        markRenderedImageUnavailable();
      }}
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
