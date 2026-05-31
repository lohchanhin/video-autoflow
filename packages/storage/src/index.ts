import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type StorageDriver = "local" | "gcs";

export interface GcsStorageConfig {
  applicationCredentials?: string | undefined;
  bucket?: string | undefined;
  prefix?: string | undefined;
  projectId?: string | undefined;
}

export interface StorageAdapterOptions {
  apiPublicBaseUrl: string;
  gcs?: GcsStorageConfig;
  uploadsDir?: string;
  workspaceRoot?: string;
}

export interface StoredObject {
  driver: StorageDriver;
  fallbackReason?: string | undefined;
  localPath?: string | undefined;
  publicUrl?: string | undefined;
  storagePath: string;
}

export interface StorageAdapter {
  driver: StorageDriver;
  rootDir: string;
  getFile(relativePath: string): StoredObject;
  resolveLocalPath(relativePath: string): string;
  writeFile(relativePath: string, data: Buffer | string): Promise<StoredObject>;
  copyFile(sourcePath: string, relativePath: string): Promise<StoredObject>;
}

export function hasGcsConfig(gcs: GcsStorageConfig | undefined): boolean {
  return Boolean(gcs?.bucket && gcs.projectId && gcs.applicationCredentials);
}

export function findWorkspaceRoot(startDirectory = process.cwd()): string {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    if (existsSync(path.join(currentDirectory, "pnpm-workspace.yaml"))) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return path.resolve(startDirectory);
    }

    currentDirectory = parentDirectory;
  }
}

export function createStorageAdapter(options: StorageAdapterOptions): StorageAdapter {
  const workspaceRoot = options.workspaceRoot ?? findWorkspaceRoot();
  const uploadsDir = options.uploadsDir ?? "uploads";
  const rootDir = path.isAbsolute(uploadsDir) ? uploadsDir : path.join(workspaceRoot, uploadsDir);

  return new LocalStorageAdapter({
    apiPublicBaseUrl: options.apiPublicBaseUrl,
    rootDir,
    ...(hasGcsConfig(options.gcs) ? {} : { fallbackReason: "GCS is not fully configured; using local uploads directory." })
  });
}

class LocalStorageAdapter implements StorageAdapter {
  public readonly driver = "local";
  public readonly rootDir: string;

  private readonly apiPublicBaseUrl: string;
  private readonly fallbackReason: string | undefined;

  public constructor(options: { apiPublicBaseUrl: string; fallbackReason?: string | undefined; rootDir: string }) {
    this.apiPublicBaseUrl = options.apiPublicBaseUrl.replace(/\/$/u, "");
    this.fallbackReason = options.fallbackReason;
    this.rootDir = path.resolve(options.rootDir);
  }

  public resolveLocalPath(relativePath: string): string {
    const safeRelativePath = normalizeRelativePath(relativePath);
    return path.join(this.rootDir, ...safeRelativePath.split("/"));
  }

  public getFile(relativePath: string): StoredObject {
    const destinationPath = this.resolveLocalPath(relativePath);
    return this.toStoredObject(relativePath, destinationPath);
  }

  public async writeFile(relativePath: string, data: Buffer | string): Promise<StoredObject> {
    const destinationPath = this.resolveLocalPath(relativePath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, data);
    return this.toStoredObject(relativePath, destinationPath);
  }

  public async copyFile(sourcePath: string, relativePath: string): Promise<StoredObject> {
    const destinationPath = this.resolveLocalPath(relativePath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
    return this.toStoredObject(relativePath, destinationPath);
  }

  private toStoredObject(relativePath: string, localPath: string): StoredObject {
    const safeRelativePath = normalizeRelativePath(relativePath);

    return {
      driver: this.driver,
      storagePath: `local://uploads/${safeRelativePath}`,
      localPath,
      publicUrl: `${this.apiPublicBaseUrl}/uploads/${safeRelativePath}`,
      fallbackReason: this.fallbackReason
    };
  }
}

function normalizeRelativePath(relativePath: string): string {
  const normalized = path.posix.normalize(relativePath.replaceAll("\\", "/")).replace(/^\/+/u, "");

  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Unsafe storage path: ${relativePath}`);
  }

  return normalized;
}
