# Architecture

## Direction

The project is a local-first TypeScript monorepo. The first deployment target is a single DigitalOcean Droplet running Docker Compose.

## Monorepo Layout

- `apps/api-server`: Express API server.
- `packages/shared-types`: shared TypeScript types.
- `packages/config`: centralized environment configuration.
- `packages/logger`: structured logging.
- `workers/*`: future BullMQ workers.
- `docs/*`: product, architecture, and Codex task guidance.
- `infra/deploy`: future deployment notes and scripts.

## Future Runtime Components

- API server for job, asset, cost, publishing, and analytics endpoints.
- MongoDB for content/job records.
- Redis + BullMQ for queue orchestration.
- MinIO or S3-compatible storage for generated assets.
- FFmpeg for local MP4 composition.
- Provider packages for LLM, image, video, TTS, and YouTube APIs.

## Local Workflow Ports

The MVP uses BullMQ queues as the real internal integration layer. The local ports below are reserved for future worker adapters, debug endpoints, or health checks if a worker becomes a standalone process.

- API server: `4000`
- Admin web: `5173`
- MongoDB: `27017`
- Redis: `6379`
- MinIO API / console: `9000` / `9001`
- Script worker adapter: `4101`
- Storyboard worker adapter: `4102`
- Image worker adapter: `4103`
- Video worker adapter: `4104`
- TTS worker adapter: `4105`
- Subtitle worker adapter: `4106`
- Compose worker adapter: `4107`
- Publisher worker adapter: `4108`
- Storage adapter: `4109`

## AI Tool Endpoints

- LLM: OpenAI, DeepSeek, or Gemini through `LLMProvider`.
- Image: fal, Replicate, or OpenAI Images through `ImageProvider`.
- Video: Runway, MiniMax, or fal video through `VideoProvider`; disabled by default for MVP cost control.
- TTS: OpenAI TTS by default through `TTSProvider`; ElevenLabs remains an optional fallback.
- Compose: local FFmpeg; no paid API.
- Upload: YouTube Data API; private upload only.
- Storage: Google Cloud Storage for future deployment, MinIO for local development.

## Core Safety Defaults

- Secrets come only from `.env` or deployment environment variables.
- Paid external APIs are hidden behind provider interfaces.
- Tests must use mocks instead of real paid APIs.
- Upload privacy defaults to `private`.
- Public upload is blocked unless `ENABLE_AUTO_PUBLIC=true`.
- Every provider call must eventually create a cost log.

## Key Management Direction

The admin web includes a dedicated Keys page so provider credentials are not managed only by editing `.env`.

- `.env` remains a bootstrap and local fallback source.
- The UI treats provider keys as write-only secrets and displays only status plus the last four characters.
- A later backend phase should persist submitted keys in an encrypted server-side store, never return raw keys to the browser, and inject them into provider interfaces at runtime.
