# CODEX_TASKS.md

## Current Goal

Build the MVP for AI Content Operations Factory. Horror is one supported template, alongside comedy, romance, fairy tale, and future reusable Shorts formats.

## MVP Scope

- Script generation.
- Storyboard generation.
- Multi-genre template selection.
- Image generation via API.
- TTS generation via API.
- FFmpeg composition.
- YouTube private upload.
- Cost tracking.
- Admin dashboard.

## Not In Scope Yet

- Multi-channel automation.
- Auto public publishing.
- Advanced analytics.
- Revenue calculation.
- TikTok / Facebook upload.
- Full video API for every scene.
- GPU self-hosting.

## Task List

### Phase 0: Setup

- [x] Initialize monorepo.
- [x] Add Docker Compose.
- [x] Add config package.
- [x] Add logger package.
- [x] Add shared-types package.
- [x] Add API health endpoint.

### Phase 1: Core Backend

- [ ] Add MongoDB models.
- [ ] Add job API.
- [ ] Add queue package.
- [ ] Add orchestrator.

### Phase 2: Generation

- [ ] Add LLM provider.
- [ ] Add script worker.
- [ ] Add storyboard worker.
- [ ] Add image worker.
- [ ] Add TTS worker.

### Phase 3: Compose

- [ ] Add subtitle generator.
- [ ] Add FFmpeg composer.
- [ ] Add QC worker.

### Phase 4: Publishing

- [ ] Add YouTube provider.
- [ ] Add private upload.
- [ ] Add publishing logs.

### Phase 5: Admin

- [ ] Dashboard.
- [ ] Job detail.
- [ ] Cost dashboard.
- [ ] Provider settings.
