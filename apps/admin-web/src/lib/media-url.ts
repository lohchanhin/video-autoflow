const localUploadPrefix = "local://uploads/";

export function resolveMediaUrl(value: string | null | undefined): string {
  const raw = (value ?? "").trim();

  if (!raw) {
    return "";
  }

  if (/^(blob:|data:)/iu.test(raw)) {
    return raw;
  }

  if (raw.startsWith(localUploadPrefix)) {
    return `${getUploadsBaseUrl()}/${encodeURI(raw.slice(localUploadPrefix.length)).replace(/%2F/giu, "/")}`;
  }

  if (/^\/?uploads\//iu.test(raw)) {
    return `${getUploadsBaseUrl()}/${encodeURI(raw.replace(/^\/?uploads\//iu, "")).replace(/%2F/giu, "/")}`;
  }

  try {
    const url = new URL(raw);

    if (url.pathname.startsWith("/uploads/") && shouldRewriteUploadUrl(url)) {
      return `${getUploadsBaseUrl()}${url.pathname.slice("/uploads".length)}${url.search}`;
    }

    return raw;
  } catch {
    return raw;
  }
}

export function resolveFirstMediaUrl(values: Array<string | null | undefined>): string {
  for (const value of values) {
    const resolved = resolveMediaUrl(value);

    if (resolved) {
      return resolved;
    }
  }

  return "";
}

export function isImageMediaUrl(value: string | null | undefined): boolean {
  const resolved = resolveMediaUrl(value);
  return /^data:image\//iu.test(resolved) || /\.(svg|png|jpe?g|webp|bmp|gif)(\?|$)/iu.test(resolved);
}

export function isRasterImageMediaUrl(value: string | null | undefined): boolean {
  const resolved = resolveMediaUrl(value);
  return /^data:image\/(png|jpe?g|webp|bmp|gif)/iu.test(resolved) || /\.(png|jpe?g|webp|bmp|gif)(\?|$)/iu.test(resolved);
}

export function isVideoMediaUrl(value: string | null | undefined): boolean {
  return /\.(mp4|mov|webm)(\?|$)/iu.test(resolveMediaUrl(value));
}

export function isAudioMediaUrl(value: string | null | undefined): boolean {
  return /\.(mp3|wav|m4a|aac|ogg|opus|flac)(\?|$)/iu.test(resolveMediaUrl(value));
}

function shouldRewriteUploadUrl(url: URL): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (isLocalHost(url.hostname)) {
    return true;
  }

  const currentHostname = window.location.hostname;

  if (isVpsHost(url.hostname)) {
    return !isLocalHost(currentHostname);
  }

  return window.location.protocol === "https:" && url.protocol === "http:" && url.pathname.startsWith("/uploads/");
}

function getUploadsBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:4000/uploads";
  }

  const hostname = window.location.hostname;

  if (hostname && hostname !== "127.0.0.1" && hostname !== "localhost") {
    if (isIpAddress(hostname)) {
      return `${window.location.protocol}//${hostname}:4000/uploads`;
    }

    return `${window.location.origin}/uploads`;
  }

  return "http://127.0.0.1:4000/uploads";
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isVpsHost(hostname: string): boolean {
  return hostname === "137.184.100.54" || hostname === "vertex-workflow.com" || hostname === "www.vertex-workflow.com";
}

function isIpAddress(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname) || hostname.includes(":");
}
