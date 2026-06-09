import type { JobStatus } from "@ai-content-factory/shared-types";
import type { ProcessRecordStatus, SceneReviewItem } from "./jobs.js";

export const statusLabels: Record<JobStatus, string> = {
  PENDING: "待处理",
  SCRIPT_GENERATING: "生成脚本中",
  SCRIPT_DONE: "脚本完成",
  STORYBOARD_GENERATING: "生成分镜中",
  STORYBOARD_DONE: "分镜完成",
  IMAGE_GENERATING: "生成图片中",
  IMAGE_DONE: "图片完成",
  VIDEO_GENERATING: "生成视频片段中",
  VIDEO_DONE: "视频片段完成",
  TTS_GENERATING: "TTS",
  TTS_DONE: "配音完成",
  BGM_GENERATING: "生成 BGM 中",
  BGM_DONE: "BGM 完成",
  COMPOSING: "合成中",
  COMPOSED: "已合成",
  QC_CHECKING: "QC 检查中",
  QC_PASSED: "QC 通过",
  READY_TO_UPLOAD: "待上传",
  UPLOADING: "上传中",
  UPLOADED_PRIVATE: "已私密上传",
  SCHEDULED: "已排程",
  PUBLISHED: "已发布",
  ANALYTICS_COLLECTING: "收集数据中",
  COMPLETED: "已完成",
  FAILED: "失败"
};

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
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

export function formatProcessRecordStatus(status: ProcessRecordStatus): string {
  const labels: Record<ProcessRecordStatus, string> = {
    done: "已完成",
    failed: "失败",
    pending: "待处理",
    skipped: "已跳过",
    working: "处理中"
  };

  return labels[status];
}

export function formatSceneReviewStatus(status: SceneReviewItem["status"]): string {
  const labels: Record<SceneReviewItem["status"], string> = {
    approved: "已批准",
    generated: "待审核",
    needs_review: "需复核",
    rejected: "已拒绝"
  };

  return labels[status];
}

export function formatSceneQcStatus(status: SceneReviewItem["qcStatus"]): string {
  const labels: Record<SceneReviewItem["qcStatus"], string> = {
    fail: "未通过",
    not_checked: "未检查",
    pass: "通过",
    warning: "需注意"
  };

  return labels[status];
}

export function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "无";
}
