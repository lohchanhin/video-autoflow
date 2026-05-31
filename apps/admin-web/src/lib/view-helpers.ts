import type { JobStatus } from "@ai-content-factory/shared-types";
import type { ProcessRecordStatus } from "./jobs.js";

export const statusLabels: Record<JobStatus, string> = {
  PENDING: "Pending",
  SCRIPT_GENERATING: "Script",
  SCRIPT_DONE: "Script done",
  STORYBOARD_GENERATING: "Storyboard",
  STORYBOARD_DONE: "Storyboard done",
  IMAGE_GENERATING: "Images",
  IMAGE_DONE: "Images done",
  VIDEO_GENERATING: "Video API",
  VIDEO_DONE: "Video done",
  TTS_GENERATING: "TTS",
  TTS_DONE: "TTS done",
  BGM_GENERATING: "BGM",
  BGM_DONE: "BGM done",
  COMPOSING: "Composing",
  COMPOSED: "Composed",
  QC_CHECKING: "QC",
  QC_PASSED: "QC passed",
  READY_TO_UPLOAD: "Ready",
  UPLOADING: "Uploading",
  UPLOADED_PRIVATE: "Private",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  ANALYTICS_COLLECTING: "Analytics",
  COMPLETED: "Complete",
  FAILED: "Failed"
};

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function getStatusTone(status: JobStatus): "neutral" | "active" | "success" | "danger" {
  if (status === "FAILED") {
    return "danger";
  }

  if (status === "COMPLETED" || status === "UPLOADED_PRIVATE" || status === "QC_PASSED") {
    return "success";
  }

  if (status.endsWith("GENERATING") || status === "COMPOSING" || status === "UPLOADING" || status === "QC_CHECKING") {
    return "active";
  }

  return "neutral";
}

export function getRecordTone(status: ProcessRecordStatus): "neutral" | "active" | "success" | "danger" {
  if (status === "failed") {
    return "danger";
  }

  if (status === "done") {
    return "success";
  }

  if (status === "working") {
    return "active";
  }

  return "neutral";
}

export function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "None";
}
