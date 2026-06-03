# Fairy Series Production Report

Run window: 2026-06-03 MYT / 2026-06-02 UTC API timestamps  
Environment: DigitalOcean VPS `137.184.100.54`  
Branch: `codex/series-story-world-brief`  
Deployed commit: `55e53ba`  
Budget approved for this R&D run: RM100  
Recorded spend after run: RM65.4923

## Objective

Use the real production flow to create a reusable fairy-tale story series:

- Create reusable visual assets.
- Create a story world.
- Create a content series.
- Create continuous short-form episodes.
- Generate actual MP4 outputs on the VPS.
- Identify workflow and product problems from the run.

## VPS State

Verified services:

- `admin-web`: running on `http://137.184.100.54:5173`
- `api-server`: running on `http://137.184.100.54:4000`
- `mongo`: running
- `redis`: running

Health endpoint:

- `http://137.184.100.54:4000/health`

The VPS git worktree was clean after the production run.

## Reusable Assets

The run used and/or created the following reusable assets.

### Characters

| Asset | Production asset ID | Notes |
| --- | --- | --- |
| 米米兔三视图 | `production_asset_cc43562a-76ad-4ed5-84c5-9b91f7d26df2` | Existing rabbit character asset, renamed for consistency. |
| 猫头鹰老师 | `production_asset_5f5b5d87-0169-44c3-aad8-248396ba277f` | Existing teacher character asset. |
| 虎虎小老虎三视图 | `asset_library_character_huhu_tiger` | New generated tiger character asset. |

Tiger reference image:

- `http://137.184.100.54:4000/uploads/jobs/asset_library/asset_library_character_huhu_tiger/references/character_design.png`

### Scenes / Style

| Asset | Production asset ID | Notes |
| --- | --- | --- |
| 彩虹森林 | `production_asset_57a6b061-3ea7-4840-8e94-efdcbcb36ea3` | Main story-world scene asset. |
| 森林学校 | `production_asset_879ecf47-d57e-4e05-a679-9311b706722a` | School setting asset. |
| 猫头鹰教室 | `production_asset_0050b275-7f4a-4569-a92f2a2b8d0e354b3` | Classroom setting asset. |

## Story World

Story world ID:

- `story_world_rainbow_forest_values`

Name:

- 彩虹森林童话世界

Purpose:

- A reusable gentle fairy-tale world for short-form values stories.
- Characters and scenes should stay warm, colorful, fictional, and family-friendly.
- The world is not hardcoded into the product; it is a reusable content library entry.

## Series

Series ID:

- `series_rainbow_forest_values_s1`

Name:

- 彩虹森林品格故事 第一季

Series positioning:

- Short-form fairy-tale value stories.
- Reusable animal characters.
- Reusable forest/school/classroom settings.
- Each episode teaches one clear value through a small conflict and a simple ending.

Generated episode ideas:

- 4 total ideas were created by AI.
- The first 2 were approved and converted into production cases.

Approved episodes:

| Episode | Episode ID | Production case ID | Result |
| --- | --- | --- | --- |
| 不是我的错 | `episode_9c8ee6b9-32a7-4ea9-8e5a-08db5cc835c7` | `job_fairy_20260602_ep01` | MP4 generated, QC passed. |
| 排队真麻烦 | `episode_283dccc3-41c4-47e2-9a24-2d943d8e605a` | `job_fairy_20260602_ep02` | MP4 generated, QC passed. |

## Final Videos

### Episode 1: 不是我的错

Case ID:

- `job_fairy_20260602_ep01`

Final MP4:

- `http://137.184.100.54:4000/uploads/jobs/job_fairy_20260602_ep01/final/video.mp4`

Subtitles:

- `http://137.184.100.54:4000/uploads/jobs/job_fairy_20260602_ep01/subtitles.srt`

QC:

- Passed.

Recorded cost:

- RM5.511

### Episode 2: 排队真麻烦

Case ID:

- `job_fairy_20260602_ep02`

Final MP4:

- `http://137.184.100.54:4000/uploads/jobs/job_fairy_20260602_ep02/final/video.mp4`

Subtitles:

- `http://137.184.100.54:4000/uploads/jobs/job_fairy_20260602_ep02/subtitles.srt`

QC:

- Passed with one warning: BGM was not generated.

Recorded cost:

- RM3.7213

## Cost Summary

Total recorded cost:

- RM65.4923

By provider:

| Provider | Recorded RM |
| --- | ---: |
| OpenAI | 35.2505 |
| Seedance | 30.2418 |
| ElevenLabs | 0 |
| Local FFmpeg | 0 |

By service:

| Service | Recorded RM |
| --- | ---: |
| Video | 30.2418 |
| Image | 23.8215 |
| Reference design | 11.2692 |
| Script | 0.1441 |
| TTS | 0.0157 |
| BGM | 0 |
| Compose | 0 |

Important accounting note:

- Episode 2 TTS was recovered through a direct ElevenLabs call because OpenAI TTS hit quota. That recovery created the audio file successfully but did not pass through the official provider/cost logging path. This is a product gap and must be fixed before larger automation runs.

## Flow Problems Found

### 1. Case source of truth is still split

The run proved the API can create assets, story worlds, series, episodes, and MP4 outputs on the VPS. However, the admin case history is not fully MongoDB-first yet. API-created production cases can be difficult to inspect from the UI if the UI still relies on local state.

Required fix:

- Make Cases MongoDB-first.
- Store confirmed outline, storyboard, selected assets, scene artifacts, audio, subtitles, final MP4, QC, and activity log in MongoDB.
- The UI should query the API, not browser localStorage, for business data.

### 2. Approved outline must remain the single source for downstream work

The product must never generate an outline, ask the user to approve it, then regenerate a different script in the Script tab.

Required fix:

- `Confirm outline` writes title, script, storyboard, visual bible, BGM brief, selected characters, selected scenes, story world, and series context into the case.
- Downstream images, TTS, subtitles, clips, and MP4 read from that approved case record.
- Regenerating the script must be an explicit destructive action that marks downstream artifacts stale.

### 3. Asset binding needs stronger reference semantics

Selected characters and selected scenes must travel with the case.

Required fix:

- Bind all selected character assets and scene assets to the case.
- Do not overwrite multiple references by using only `jobId + type + sceneId` as the logical key.
- Store case-level reference assets separately from scene-level first/last frames.

### 4. Image generation needs per-scene reliability

The initial batch image generation timed out after partial success. This creates a risk where an image file exists but the cost/event is not logged.

Required fix:

- Prefer per-scene generation calls with per-scene cost logging.
- Batch calls should record partial success and failure state.
- UI should show scene-level progress, retry, and approval.

### 5. OpenAI account hard limit stopped generation

OpenAI image and TTS generation later failed because the account reached a hard billing/quota limit.

Required fix:

- Readiness should distinguish code failure from provider quota failure.
- UI should show provider quota/billing blockers clearly.
- Autopilot should stop before repeatedly calling a blocked provider.

### 6. ElevenLabs BGM quota was insufficient

ElevenLabs BGM failed because the key did not have enough available credits for the requested music generation.

Required fix:

- Estimate BGM credit/cost before generation.
- Show ElevenLabs credit blocker in Workflow readiness.
- Allow MP4 generation without BGM, but label it clearly.

### 7. Seedance references need public URL discipline

Seedance video clip generation worked, but one call reported that some reference assets were not publicly reachable by the provider.

Required fix:

- Move production references to GCS or another stable public/signed HTTPS storage path.
- Store generated reference asset URLs in MongoDB.
- Validate all reference URLs before sending to Seedance.

### 8. Video clip strategy needs a cost policy

Seedance cost is materially higher than image + FFmpeg composition. For this R&D run, Seedance was useful as a recovery path for one missing scene, not as the default for every scene.

Required fix:

- Default MP4 path should be image + TTS + subtitles + optional BGM.
- Video API should be opt-in per case, per scene, or only for hero shots.
- Workflow settings must expose provider/model/quality/duration and expected cost before execution.

### 9. Cost engine still needs full provider coverage

The current cost logs cover many calls, but not every emergency or direct-provider path.

Required fix:

- All provider implementations must write `cost_logs`.
- Add official ElevenLabs TTS/music cost logging.
- Add model-level pricing presets and manual override fields.
- Mark pricing status as `exact`, `estimated`, or `missing`.

### 10. Series UX should use compact asset pickers

Series and asset binding should not show huge vertical images in form sections.

Required fix:

- Use compact selectable thumbnails.
- Support multi-select characters, scenes, style references, and story worlds.
- Show selected assets as chips or a compact reference rail.

## What Worked

- VPS deployment is usable for real generation.
- MongoDB-backed production assets and series data can support reusable content workflows.
- A story world plus reusable character/scene assets can produce more than one related short.
- FFmpeg composition generated vertical MP4 outputs with subtitles and audio.
- QC checks passed for both final MP4s.
- The run stayed inside the approved RM100 R&D budget.

## Recommended Next Engineering Pass

Priority order:

1. Make Cases MongoDB-first.
2. Preserve approved outline as the canonical downstream source.
3. Fix case asset binding and reference propagation.
4. Rebuild Case Assets tab as scene-level review cards.
5. Add official ElevenLabs TTS/music provider routes and cost logging.
6. Add provider quota/readiness blockers.
7. Move production references to GCS/signed HTTPS storage.
8. Add a per-scene Seedance cost policy and model selector.

## Completion Evidence

Evidence that the R&D objective was reached:

- Reusable character and scene assets exist.
- Story world exists.
- Series exists.
- Episode ideas exist.
- Two approved episodes were converted into production cases.
- Two MP4 videos were generated on the VPS.
- Both final MP4s passed QC.
- Total recorded cost is under RM100.
- Product/workflow problems were identified from real execution, not theoretical review.

