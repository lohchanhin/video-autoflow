# AI Content Factory

AI Content Factory 是一个本地优先、未来可部署到 DigitalOcean Droplet 的 AI 内容生产系统。它不是单一恐怖短片工具，而是一个可配置的短视频生产后台：输入一句想法后，系统可以生成脚本、分镜、设计资产、图片、配音、背景音乐、字幕、视频片段、最终 MP4，并在人工审核后再进入 YouTube private upload。

当前重点是 **AI Tool Routing & Cost Control**：脚本、图片、设计图、TTS、BGM、影片、字幕、合成、Storage、YouTube 都通过统一工具设置管理，不把模型、供应商、题材硬编码死。

## Tech Stack

- Node.js 20+ / TypeScript
- pnpm workspace monorepo
- Express API server
- React + Vite admin web
- MongoDB
- Redis / BullMQ 方向
- FFmpeg
- Local uploads fallback，后续可接 GCS / MinIO
- Docker Compose for local and VPS deployment

## Monorepo Structure

```text
apps/
  api-server/     Express API
  admin-web/      Operations console
packages/
  config/         Environment config
  database/       MongoDB repositories
  logger/         Structured logging
  shared-types/   Shared TypeScript types
  storage/        Local/GCS storage abstraction
docs/             Product and architecture docs
infra/deploy/     VPS git deployment docs/scripts
uploads/          Local generated media, ignored by git
```

## Local Development

```powershell
corepack enable
corepack prepare pnpm@9.15.4 --activate
corepack pnpm install
Copy-Item .env.example .env
corepack pnpm dev
```

Services:

- Admin Web: `http://127.0.0.1:5173/#cases`
- API: `http://127.0.0.1:4000`
- API health: `http://127.0.0.1:4000/health`

Useful commands:

```powershell
corepack pnpm dev:api
corepack pnpm dev:web
corepack pnpm type-check
corepack pnpm lint
corepack pnpm test
corepack pnpm --filter @ai-content-factory/admin-web build
```

## Environment

Copy `.env.example` to `.env` and fill only the providers you want to use.

Important rules:

- `.env` is ignored by git.
- Never commit API keys, OAuth tokens, generated videos, logs, or uploads.
- YouTube upload defaults to `private`.
- If GCS is not configured, generated files use `uploads/`.

## Product Flow

The MVP production chain is:

```text
idea -> outline -> script -> storyboard -> visual/design assets -> images
-> voiceover -> BGM -> subtitles -> optional video clips -> final MP4
-> QC -> human review -> YouTube private upload targets
```

Video API clips are optional. The system can still compose an MP4 from images, TTS, BGM, and subtitles.

## Logic Architecture

The current architecture source of truth is [docs/LOGIC_ARCHITECTURE.md](docs/LOGIC_ARCHITECTURE.md). It defines the product layers, MongoDB business objects, Case lifecycle, asset reference flow, tool routing, cost control, automation, publishing matrix, and Mermaid diagrams that should guide implementation order.

## Tool Settings

Open `Workflow > Tools` in the admin web to configure each tool:

- Provider
- API style
- Base URL
- Model ID
- Quality / size / voice / format params
- Cost mode and unit price
- Retry limit
- Enabled / allow autopilot

Presets only fill defaults. They do not restrict future model IDs or custom compatible APIs.

## Git Workflow

This repository is intended to be developed with small, reviewable git changes.

Recommended flow:

```powershell
git status
git checkout -b feature/<short-name>
corepack pnpm type-check
corepack pnpm lint
corepack pnpm test
git add .
git commit -m "Describe the change"
git push origin feature/<short-name>
```

Do not commit:

- `.env` or secrets
- `uploads/`
- logs
- local smoke-test JSON output
- `.codex/`

## VPS Deployment

The first deployment target is one DigitalOcean Droplet using Git + Docker Compose.

Server flow:

```bash
git clone <repo-url> /opt/ai-content-factory
cd /opt/ai-content-factory
cp .env.example .env
nano .env
APP_DIR=/opt/ai-content-factory BRANCH=main bash infra/deploy/git-pull-deploy.sh
```

Details are in `infra/deploy/README.md`.

## Current Safety Defaults

- Uploads default to private.
- Public YouTube publishing is disabled by default.
- External paid APIs should not be called in tests.
- Every provider call should record cost.
- Missing keys/model/pricing should surface a setup blocker instead of silently using mock data.
