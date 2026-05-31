# PRD: AI Content Operations Factory

## Product Goal

Build an MVP content pipeline that can generate fictional YouTube Shorts across reusable genre templates, compose the final MP4 locally with FFmpeg, and upload the video to YouTube as private for human review.

## MVP Flow

`topic -> script -> storyboard -> image -> tts -> subtitle -> mp4 -> qc -> YouTube private upload`

## MVP Scope

- Script generation.
- Storyboard generation.
- AI image generation through provider interfaces.
- TTS generation through provider interfaces. MVP default is OpenAI TTS; ElevenLabs remains optional.
- Background music generation through ElevenLabs Music.
- Subtitle generation.
- FFmpeg composition.
- Cost tracking for every provider call.
- YouTube private upload with multi-account publishing target records.
- Daily automation rules that generate cases up to MP4, then wait for human approval.
- Minimal API server.

## Out of Scope for MVP

- Automatic public publishing.
- Advanced analytics and revenue modeling.
- TikTok, Facebook, or Instagram publishing.
- Video API generation for every scene.
- GPU self-hosting.

## Supported Content Templates

Horror is one template family, not the system boundary. The shared template model currently supports:

- `rules_horror`
- `surveillance_horror`
- `urban_legend`
- `comedy_sketch`
- `romance_story`
- `fairy_tale`

## Example Template Config

```json
{
  "templateType": "comedy_sketch",
  "durationSeconds": 45,
  "sceneCount": 5,
  "language": "zh-CN",
  "voiceStyle": "energetic_narrator",
  "visualStyle": "bright modern comedy, expressive reaction cuts, clean vertical framing",
  "subtitleStyle": "large white text with black stroke",
  "bgmStyle": "light rhythmic underscore",
  "sfxPack": "comedy_basic",
  "videoApiScenes": 0,
  "imageCount": 5,
  "uploadPrivacy": "private"
}
```
