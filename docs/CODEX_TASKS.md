# CODEX_TASKS.md

## Current Goal

Build the AI Content Operations Factory through Phase 7, then pause.

The target is not a single-video generator. The system must support reusable content strategy, series, story worlds, reusable design assets, structured cases, tool routing, cost logging, and scheduled production up to MP4 + QC.

## Product Direction

- One video is a `Case`.
- A confirmed AI outline is the source of truth for script, storyboard, image prompts, TTS, subtitles, clips, and final MP4.
- Series, Story Worlds, Episode Ideas, characters, scenes, and style assets are reusable production inputs.
- Production assets are MongoDB-first business data; localStorage is only for non-business UI state.
- Tools are configured globally in Workflow / Tools, not inside a Case.
- Automation can create and process Cases up to MP4 + QC.
- YouTube publishing remains private-only and must stay behind human review.

## Stop Boundary

Pause after Phase 7 is working and verified:

`Series / Story World / Assets -> Case Brief -> Confirmed Outline -> Images -> TTS/BGM/Subtitles -> FFmpeg MP4 -> QC -> Needs Review -> Scheduled Run support`

Do not expand into Phase 8 multi-account YouTube upload execution or Phase 9 analytics until Phase 7 is stable.

## Phase 0: Architecture Baseline

- [x] Add `docs/LOGIC_ARCHITECTURE.md`.
- [x] Link the logic architecture from `README.md`.
- [x] Link the logic architecture from `docs/ARCHITECTURE.md`.
- [x] Replace this task file with the Phase 0-7 execution queue.

## Phase 1: Stable Data Model

- [x] Confirm shared types for `ProductionBrief`, `StoryWorld`, `ContentSeries`, `SeriesEpisodeIdea`, `ProductionAsset`, `JobProcessRecord`, and `ToolProviderSettings`.
- [x] Ensure MongoDB-backed APIs exist for production assets.
- [x] Ensure MongoDB-backed APIs exist for series and episode ideas.
- [x] Ensure MongoDB-backed APIs exist for story worlds.
- [x] Ensure cost logs include provider, model, tool type, unit, quantity, cost RM, pricing source, and job id.

## Phase 2: Case Brief And Outline Lock

- [x] New Case supports optional Series, Episode Idea, Story World, multiple character assets, multiple scene assets, and lesson / goal / conflict / tone fields.
- [x] Draft outline generation uses structured `ProductionBrief`.
- [x] Confirming a draft writes the exact preview title, script, storyboard, Visual Bible, and BGM brief into the Case records.
- [x] Existing script/story records block accidental regeneration.
- [x] Script overwrite is an explicit destructive action that confirms with the user and marks downstream stages as needing rerun.
- [x] Script tab shows the approved outline; it must not silently generate a different story.

## Phase 3: Asset Library And Reference Transfer

- [x] Assets page supports reusable character design, scene design, style references, first frames, last frames, and BGM references.
- [x] Character and scene designs support production-grade reference requirements such as turnaround views and environment bible details.
- [x] New Case multi-select assets are copied or bound into `production_assets` for the Case.
- [x] Case generation references merge selected assets, Case-bound assets, Series assets, and Episode assets.
- [x] Image and video generation receive all approved / ready references.
- [x] Rejected assets are never used by Seedance or image generation.

## Phase 4: Images, Voice, Music, Subtitles, Compose

- [x] Image generation reads only approved storyboard and Visual Bible context.
- [x] Image prompts do not include script-writing instructions, production brief scaffolding, UI labels, or table content.
- [x] Case Assets tab is a usable workbench: reference assets, scene image review, and artifact summary.
- [x] TTS voiceover and subtitles are synchronized to scene timing.
- [x] BGM is optional and can be generated or skipped explicitly.
- [x] FFmpeg can compose image-based MP4 with subtitles, voiceover, optional BGM, and correct duration.
- [x] Video clip generation is optional; image MP4 remains a valid low-cost path.

## Phase 5: Tool Routing And Cost Control

- [x] Workflow / Tools is the only global provider/model/endpoint/cost configuration surface.
- [x] Every tool type supports provider and model dropdown presets plus custom model entry.
- [x] Readiness checks use saved tool settings and provider key status.
- [x] Missing key, model, endpoint, or price becomes a setup blocker instead of mock output.
- [x] Every real provider call records cost with provider/model/tool/quantity/unit.
- [x] Case Overview shows actual cost and next-step estimated cost.
- [x] Budget guard blocks autopilot unless the user explicitly overrides.

## Phase 6: Series And Episode Library

- [x] Series page manages reusable series positioning, audience, content type, tone, safety rules, visual style, music style, and reference assets.
- [x] Story World can be bound to Series and inherited by Cases.
- [x] Episode Ideas include episode number, title, lesson/theme, selected characters, selected scenes, synopsis, interactive ending, status, and converted case id.
- [x] AI can generate Episode Ideas from a Series.
- [x] Only approved Episode Ideas can convert into Cases.
- [x] Converted Cases inherit Series, Episode, Story World, selected characters, selected scenes, and safety rules.

## Phase 7: Scheduled Production To MP4/QC

- [x] Automation schedules store enabled state, timezone, days, start time, per-run count, daily max, budget, approval gate, and target ids.
- [x] `Run now` creates scheduled Cases only when readiness, daily limit, and budget guard pass.
- [x] Scheduled Cases carry `source: scheduled` and schedule/run metadata.
- [x] Autopilot for scheduled Cases runs to MP4 + QC.
- [x] Successful scheduled output stops at `Needs Review`.
- [x] Failed scheduled output records failure reason, retry state, and activity log.

## Always-On Rules

- [x] Do not hardcode secrets.
- [x] Do not call paid APIs in tests.
- [x] All uploads default to `private`.
- [x] All business edits use explicit save / cancel behavior.
- [x] No topic, genre, model, provider, or asset workflow should be hardcoded as the only allowed path.
- [x] Run `corepack pnpm type-check`, `corepack pnpm lint`, `corepack pnpm --filter @ai-content-factory/admin-web build`, and `corepack pnpm test` before claiming a phase is complete.
