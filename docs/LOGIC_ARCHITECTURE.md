# AI Content Factory 逻辑架构与流程规划

## 目标定位

本项目不是单支影片生成器，而是一个 AI Content Operations Factory：

- 上层管理内容策略：系列、世界观、题库、角色、场景、风格。
- 中层管理生产案件：每支影片都是一个 Case。
- 下层管理工具路由：LLM、图片、TTS、BGM、Video、FFmpeg、Storage、YouTube。
- 所有业务数据以 MongoDB 为 source of truth。
- 所有媒体文件进入 Storage，默认本地 `uploads/`，以后可切 GCS。
- 所有外部调用必须走工具设置、记录成本、保留日志。

核心原则：

- 先有内容架构，再有生成流程。
- 先有已确认大纲，再进入图片、配音、视频生产。
- 已选角色和场景必须作为参考资产进入后续生成。
- Case 不负责配置模型；模型只在 Workflow / Tools 管理。
- 自动化最多跑到 MP4 + QC，发布必须等人工审核。

## 1. 总体分层

```mermaid
flowchart TB
  A["内容策略层<br/>Series / Story World / Episode Ideas"] --> B["资产规划层<br/>角色设计 / 场景设计 / 风格参考"]
  A --> C["Case Brief 编排层<br/>一句话输入 + 系列 + 角色 + 场景 + 本集目标"]
  B --> C
  C --> D["AI 大纲层<br/>标题 / 脚本 / 分镜 / Visual Bible / BGM Brief"]
  D --> E["生产执行层<br/>图片 / 配音 / BGM / 字幕 / Clip / FFmpeg"]
  E --> F["审核层<br/>Scene Review / MP4 QC / Human Approval"]
  F --> G["发布层<br/>YouTube 多账号 Private Upload"]
  E --> H["成本与日志层<br/>Cost Logs / Activity / Retry / Failure"]
  G --> H
```

## 2. 核心资料模型

```mermaid
erDiagram
  CONTENT_SERIES ||--o{ SERIES_EPISODE_IDEA : owns
  STORY_WORLD ||--o{ CONTENT_SERIES : binds
  CONTENT_SERIES ||--o{ CASE_JOB : creates
  SERIES_EPISODE_IDEA ||--o| CASE_JOB : converts_to
  CASE_JOB ||--o{ JOB_PROCESS_RECORD : tracks
  CASE_JOB ||--o{ PRODUCTION_ASSET : uses
  CASE_JOB ||--o{ SCENE_REVIEW : reviews
  CASE_JOB ||--o{ COST_LOG : records
  CASE_JOB ||--o{ CASE_ACTIVITY : audits
  CASE_JOB ||--o{ CASE_PUBLISH_TARGET : targets
  YOUTUBE_ACCOUNT ||--o{ PUBLISHING_TARGET : owns
  PUBLISHING_TARGET ||--o{ CASE_PUBLISH_TARGET : receives
  TOOL_PROVIDER_SETTING ||--o{ COST_LOG : prices

  CONTENT_SERIES {
    string id
    string name
    string audience
    string contentType
    string tone
    string visualStyle
    string musicStyle
    string storyWorldId
    string referenceAssetIds
  }

  STORY_WORLD {
    string id
    string name
    string description
    string relationshipMap
    string visualStyle
    string safetyRules
  }

  PRODUCTION_ASSET {
    string id
    string jobId
    number sceneId
    string type
    string role
    string status
    string url
    string prompt
  }

  CASE_JOB {
    string id
    string seriesId
    string episodeId
    string storyWorldId
    string topic
    string status
    string reviewStatus
    number actualCostRM
  }
```

## 3. 内容库到 Case 的流程

```mermaid
flowchart LR
  A["创建 Series<br/>定位 / 受众 / 语气 / 安全规则"] --> B["绑定 Story World<br/>世界观 / 常驻地点 / 角色关系"]
  B --> C["绑定设计资产<br/>角色 / 场景 / 风格参考"]
  C --> D["AI 生成题库<br/>Episode Ideas"]
  D --> E{"人工审核题目"}
  E -->|批准| F["转换为 Case Seed"]
  E -->|拒绝| G["留在题库，不进入生产"]
  F --> H["New Case 自动带入<br/>Series + Episode + StoryWorld + Assets"]
  H --> I["生成大纲"]
```

## 4. Case Brief 编排器

```mermaid
flowchart TB
  A["用户输入一句话<br/>可以很短，也可以完整要求"] --> B["可选：选择 Series"]
  B --> C["可选：选择 Episode Idea"]
  C --> D["可选：选择 Story World"]
  D --> E["可选：多选角色资产"]
  E --> F["可选：多选场景资产"]
  F --> G["可选：本集主题 / 冲突 / 目标 / 语气"]
  G --> H["组装 ProductionBrief"]
  H --> I["LLM 生成大纲"]
  I --> J["Preview 审核<br/>标题 / 脚本 / 分镜 / Visual Bible / BGM"]
  J -->|确认| K["创建 Case，锁定大纲为生产源头"]
  J -->|重写| I
  J -->|放弃| L["不进入 Case History"]
```

## 5. 已确认大纲作为唯一生产源

```mermaid
sequenceDiagram
  participant User as 用户
  participant Web as Admin Web
  participant API as API Server
  participant LLM as LLM Provider
  participant DB as MongoDB
  participant Store as Storage

  User->>Web: 输入需求并选择角色/场景
  Web->>API: POST /cases/draft-outline
  API->>LLM: 生成标题/脚本/分镜/Visual Bible
  LLM-->>API: JSON outline
  API->>Store: 写入 script.json / storyboard.json / visual-bible.json
  API-->>Web: 返回可审核大纲
  User->>Web: 确认并创建 Case
  Web->>DB: 写入 Case metadata / production_assets
  Web->>Web: 写入 JobProcessRecord 为 done
  Note over Web,API: 后续图片/配音/字幕/MP4 只读这份已确认大纲
```

## 6. 资产规划与参考图流

```mermaid
flowchart TB
  A["设计资产中心"] --> B["生成或导入角色设计<br/>三视图 / 造型 / 固定道具"]
  A --> C["生成或导入场景设计<br/>多角度 / 空间布局 / 关键物件"]
  A --> D["生成或导入风格参考<br/>色彩 / 光线 / 材质 / 镜头感"]
  B --> E["保存入库 production_assets"]
  C --> E
  D --> E
  E --> F["New Case 多选绑定"]
  F --> G["Case 复制为参考资产<br/>status=approved / ready"]
  G --> H["Image Generation references"]
  H --> I["Scene image outputs"]
  I --> J["Scene Review"]
  J -->|批准| K["可作为 Seedance first_frame/reference"]
  J -->|拒绝| L["单场景重生，不影响其他场景"]
```

## 7. 生产状态机

```mermaid
stateDiagram-v2
  [*] --> PENDING
  PENDING --> SCRIPT_DONE: 确认大纲或生成脚本
  SCRIPT_DONE --> STORYBOARD_DONE
  STORYBOARD_DONE --> IMAGE_PROMPTS_DONE
  IMAGE_PROMPTS_DONE --> IMAGE_GENERATING
  IMAGE_GENERATING --> IMAGE_DONE: 图片 QC 通过
  IMAGE_GENERATING --> NEEDS_SCENE_REVIEW: 图片 QC 失败
  NEEDS_SCENE_REVIEW --> IMAGE_GENERATING: 单场景重生
  IMAGE_DONE --> TTS_GENERATING
  TTS_GENERATING --> TTS_DONE
  TTS_DONE --> BGM_GENERATING
  BGM_GENERATING --> BGM_DONE
  TTS_DONE --> SUBTITLE_GENERATING
  BGM_DONE --> SUBTITLE_GENERATING
  SUBTITLE_GENERATING --> SUBTITLE_DONE
  SUBTITLE_DONE --> CLIP_GENERATING: 可选 Video API
  SUBTITLE_DONE --> COMPOSING: 图片版 MP4
  CLIP_GENERATING --> CLIP_DONE
  CLIP_DONE --> COMPOSING
  COMPOSING --> COMPOSED
  COMPOSED --> QC_CHECKING
  QC_CHECKING --> NEEDS_REVIEW
  NEEDS_REVIEW --> APPROVED: 人工批准
  APPROVED --> READY_TO_UPLOAD
  READY_TO_UPLOAD --> UPLOADED_PRIVATE
  UPLOADED_PRIVATE --> COMPLETED
  SCRIPT_DONE --> SCRIPT_DONE: 明确确认后才允许覆盖重写
  NEEDS_SCENE_REVIEW --> FAILED: 超过重试
  QC_CHECKING --> FAILED: QC 不通过且放弃修复
```

## 8. 工具路由与成本控制

```mermaid
flowchart LR
  A["Production Stage"] --> B["Workflow Routing"]
  B --> C["ToolProviderSettings"]
  C --> D{"Readiness Check"}
  D -->|缺 key/model/price| E["Setup Blocker<br/>不调用 mock"]
  D -->|ready| F["Provider Interface"]
  F --> G["OpenAI / ElevenLabs / Seedance / FFmpeg / Storage / YouTube"]
  G --> H["Provider Result"]
  H --> I["Cost Recorder"]
  H --> J["Artifact Writer"]
  I --> K["cost_logs"]
  J --> L["uploads/ 或 GCS"]
  H --> M["JobProcessRecord + Activity"]
```

## 9. 自动排程与多账号发布

```mermaid
flowchart TB
  A["ProductionSchedule<br/>时间 / 时区 / 每次产量 / 预算 / targetIds"] --> B{"到点或 Run now"}
  B --> C["Readiness + Budget Guard"]
  C -->|阻塞| D["ScheduleRun blocked"]
  C -->|通过| E["创建 scheduled Cases"]
  E --> F["自动生产到 MP4 + QC"]
  F --> G["Needs Human Review"]
  G -->|批准| H["CasePublishTarget matrix"]
  H --> I["YouTube Account A / Channel 1"]
  H --> J["YouTube Account B / Channel 2"]
  H --> K["YouTube Account C / Channel 3"]
  I --> L["Private upload log"]
  J --> L
  K --> L
```

## 10. Admin Web 信息架构

```mermaid
flowchart TB
  A["Dashboard<br/>今日生产 / 阻塞 / 成本 / 待审核"] --> B["Automation<br/>排程 / Run now / 预算闸口"]
  A --> C["Series<br/>系列 / 题库 / 世界观 / 固定资产"]
  C --> D["Assets<br/>设计生成 / 资产库 / 文件夹 / Case 规划"]
  D --> E["Cases<br/>Brief / Script / Assets / Voice / Music / Clips / Final / Publish / Activity"]
  E --> F["Workflow<br/>Pipeline / Tools / Readiness"]
  F --> G["Keys<br/>Provider secrets 状态"]
  F --> H["Cost<br/>成本日志 / 单价 / 预算"]
  E --> I["YouTube<br/>账号 / 频道目标 / Private upload matrix"]
  E --> J["Storage<br/>本地 uploads / GCS"]
```

## 11. 正确实施顺序

```mermaid
flowchart LR
  A["Phase 1<br/>稳定资料模型"] --> B["Phase 2<br/>Case Brief 与大纲锁定"]
  B --> C["Phase 3<br/>资产库与参考传递"]
  C --> D["Phase 4<br/>图片/配音/字幕/合成闭环"]
  D --> E["Phase 5<br/>工具路由与成本严格化"]
  E --> F["Phase 6<br/>Series/题库批量化"]
  F --> G["Phase 7<br/>自动排程"]
  G --> H["Phase 8<br/>YouTube 多账号 Private Upload"]
  H --> I["Phase 9<br/>Analytics 回收"]
```

## 下一步开发准则

先按这个顺序收敛：

1. 确认大纲就是 Case 的生产源头，禁止下游重新编故事。
2. 角色、场景、风格参考必须先进入 `production_assets`，再进入图片和视频生成。
3. Case 页面只展示本 Case 的生产状态，不再混入全局模型设置。
4. Workflow / Tools 只管理供应商、模型、单价、是否允许自动调用。
5. Series 是内容库，不是硬编码模板；儿童教育、恐怖、喜剧都只是可配置系列。
6. 自动化只负责创建 Case 和跑到 MP4/QC；发布必须人工批准。

## 近期应该先修的模块

- Case 创建：Preview 确认后锁定脚本、分镜、Visual Bible。
- Case 资产：多选角色/场景必须完整绑定并传给生图。
- Assets 页签：改成参考资产、场景审核、产物摘要三段式。
- Series 页：题库转 Case 必须带入 Series、StoryWorld、角色、场景。
- Workflow Tools：所有模型/单价/endpoint 统一配置，不在 Case 内散落。
