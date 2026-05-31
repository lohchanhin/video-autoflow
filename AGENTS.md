# AGENTS.md

## Project

This repository is an AI Content Factory for generating fictional short-form YouTube videos across reusable genre templates. Horror/story is one supported category, not the only product boundary.

The system should eventually:
- Generate scripts.
- Generate storyboards.
- Generate AI image prompts.
- Call external AI APIs for image, video, and TTS generation.
- Compose final MP4 videos using FFmpeg.
- Upload videos to YouTube as private or scheduled.
- Track job status, costs, errors, retries, and analytics.

## Tech Stack

- Node.js
- TypeScript
- Express
- MongoDB
- Redis + BullMQ
- FFmpeg
- MinIO or S3-compatible storage
- React or Next.js for the future admin web
- Docker Compose for local development and DigitalOcean Droplet deployment

## Working Rules

- Use TypeScript strict mode.
- Do not hardcode secrets.
- Read environment variables from `packages/config`.
- Use provider interfaces for all external APIs.
- Do not call real paid APIs in tests.
- Use mocks for LLM, image, video, TTS, and YouTube providers.
- Every job must have status tracking.
- Every external API call must record cost.
- Uploads must default to private, never public.
- Add tests for new business logic.
- Run lint, type-check, and tests before finalizing changes.

## Safety Rules

- Do not generate content involving real people, minors, explicit violence, self-harm, sexual content, or copyrighted characters.
- Genre content should be fictional and stylized. Horror must stay low-gore; romance must avoid explicit sexual content; comedy must avoid harassment or humiliation; fairy tale content must avoid copyrighted characters.
- Add compliance checks before publishing.
- Avoid copying existing channels, IP, scripts, or named characters.

## Code Style

- Prefer small files and clear module boundaries.
- Use dependency injection where practical.
- Keep provider-specific logic inside `packages/providers`.
- Keep business logic inside services.
- Keep database models separate from DTOs.
- Use explicit error types.
