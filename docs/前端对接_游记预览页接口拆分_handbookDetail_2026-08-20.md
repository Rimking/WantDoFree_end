# 前端对接 · 游记预览页接口拆分：/journeys/handbook/detail（2026-08-20）

> **✅ 后端已实现并实测通过（2026-08-20）**：`POST /dream/v1/journeys/handbook/detail` 已上线（`journey.controller.ts` → `journey-aggregate.service.ts`），本文件即最终契约，前端按下文改动清单实施。
> 旅程详情页已独立拆为 `/journeys/item/detail`，本次将游记预览页（HandbookView）也从通用 `/journeys/detail` 中拆出。
> 涉及文件：`mini/src/api/journey.ts`、`mini/src/api/mappers.ts`、`mini/src/pages/HandbookView/composables/useHandbookView.ts`

---

## 0. 一句话

新增 **`POST /dream/v1/journeys/handbook/detail`** 作为游记预览页（HandbookView）专用接口，
只返回三块数据：旅程基础信息 + 记录时间线 + 预定点列表。
**`/journeys/detail` 保留不动**，未来如需新增消费方仍可临时使用。

---

## 1. 背景

旧 `/journeys/detail` 被四个模块共用（JourneyDetail / HandbookView / ...），返回大量冗余字段
（`journeyStats`、`planProgress`、`guide`、`expense.byDay`、`entries` 的 media/legacy/expenses 明细、`plan.checks`/`budgetEstimate` 等），
JourneyDetail 已独立拆走，HandbookView 是 `/journeys/detail` 现存的唯一消费者。

经前端逐字段审计，HandbookView **只消费 journey 10 字段 + records 7 字段 + planPlaces 7 字段**，
其余全部丢弃。本次拆出独立轻量接口。

---

## 2. 接口定义

| 项 | 内容 |
|---|---|
| 方法/路径 | `POST /dream/v1/journeys/handbook/detail` |
| 鉴权 | `Authorization: Bearer <token>`（JwtAuthGuard） |
| 入参 | `{ "journeyId": "xxx" }` |
| 出参 | 见 §3 |
| 错误 | 旅程不存在/无权 → 404 `journey not found` |

---

## 3. 响应结构

```json
{
  "journey": {
    "id": "b1e6...",
    "title": "成都四日漫游",
    "coverUrl": "https://cos.../cover.jpg",
    "origin": "上海",
    "destination": "成都",
    "startDate": "2026-08-01",
    "endDate": "2026-08-04",
    "status": "ongoing",
    "displayStatus": "ongoing",
    "companions": ["solo"]
  },
  "records": [
    {
      "id": "entry-uuid",
      "content": "宽窄巷子人好多，掏耳朵好舒服",
      "recordedAt": "2026-08-03 18:30:00",
      "dayIndex": 3,
      "location": { "name": "宽窄巷子" },
      "images": ["https://.../a.jpg", "https://.../b.jpg"],
      "expenses": [
        { "amountCent": 8000, "category": "food" },
        { "amountCent": 3000, "category": "ticket" }
      ]
    }
  ],
  "planPlaces": [
    {
      "id": "place-client-xxx",
      "name": "武侯祠",
      "dayIndex": 1,
      "lat": 30.6456,
      "lng": 104.0478,
      "coverUrl": "https://.../place.jpg",
      "images": ["https://.../place.jpg"],
      "locationName": "武侯祠大街231号"
    }
  ]
}
```

### 3.1 实测响应（2026-08-20 真实数据）

后端实测返回（旅程 `9e8d9327-...`）：

```json
{
  "journey": {
    "id": "9e8d9327-4c71-4922-9e10-47bf45b2dd3e",
    "title": "1",
    "coverUrl": "/dream/v1/files/2026/08/09/c2a38f15-603b-4a44-8849-e6c414119f91.jpg",
    "origin": "杭州",
    "destination": null,
    "startDate": "2026-08-20",
    "endDate": "2026-08-24",
    "status": "ongoing",
    "displayStatus": "ongoing",
    "companions": ["solo"]
  },
  "records": [
    {
      "id": "2c239d37-c63c-480d-91ae-1bbc96cb28f9",
      "content": "",
      "recordedAt": "2026-08-20 09:00:00",
      "dayIndex": 1,
      "location": { "name": "东升街道万达公寓(安福街)" },
      "images": [],
      "expenses": []
    }
  ],
  "planPlaces": [
    {
      "id": "p_mt0y7fv34sw",
      "name": "111",
      "dayIndex": 1,
      "lat": 30.57447,
      "lng": 103.92377,
      "coverUrl": null,
      "images": [],
      "locationName": "东升街道万达公寓(安福街)"
    }
  ]
}
```

---

## 4. 字段详情

### 4.1 journey（旅程基础信息）

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | string | ✓ | 旅程 id |
| `title` | string | ✓ | 旅程标题 |
| `coverUrl` | string\|null | | 主图 |
| `origin` | string\|null | | 出发点 |
| `destination` | string\|null | | 目的城市 |
| `startDate` | string | ✓ | `YYYY-MM-DD` |
| `endDate` | string | ✓ | `YYYY-MM-DD` |
| `status` | string | ✓ | `planned` \| `ongoing` \| `finished`（持久化态） |
| `displayStatus` | string\|null | | 前端展示态（`planning` / `departing` / `ongoing` / `finished`） |
| `companions` | string[] | | 同行人标签（`solo`/`couple`/`friends`/`family` 等） |

**前端用途**：

| 字段 | 消费位置 |
|------|---------|
| `coverUrl` | 游记封面大图 |
| `title` | 封面标题文字 |
| `origin` / `destination` | 路线展示「上海 → 成都」 |
| `startDate` / `endDate` | 日期展示「08.01 — 08.04」；`journeyDayProgress` 计算 Day 1 / 4 |
| `status` / `displayStatus` | 状态角标「进行中 · Day 1 / 4」 |
| `companions` | 人数展示「1 人」 |

**不返回**（前端不需要）：
`clientId` / `themeTags` / `budgetAmount` / `placeCount` / `recordCount` / `expenseTotal` /
`createdAt` / `updatedAt` / `plan` / `isPublic` / `syncVersion`

---

### 4.2 records（记录时间线）

**排序**：`COALESCE(recordedAt, createdAt)` 降序（与 itemDetail 同口径）。

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | string | ✓ | 记录 id |
| `content` | string | | 文字内容（空则为 `""`） |
| `recordedAt` | string | ✓ | `YYYY-MM-DD HH:mm:ss` |
| `dayIndex` | number\|null | | 第几天（1-based）；后端按 `recordedAt - startDate` 派生 |
| `location` | object\|null | | `{ name: string }` 仅需要地点名 |
| `images` | string[] | | 图片 URL 列表 |
| `expenses` | object[]\|null | | `[{ amountCent, category }]` 花费明细 |

**`expenses` 说明**：
- 前端需要 `category` 字段（`food` / `stay` / `transport` / `ticket` / `shopping` / `other`），
  用于游记时间线的花费标签展示（「餐饮」「住宿」「门票」等），不是金额本身。
- 只需 `amountCent` + `category`，不需要 `note` / `currency` / `sortOrder`。

**前端用途**：

| 字段 | 消费位置 |
|------|---------|
| `id` | 卡片 key |
| `content` | 切为 highlights 句子，渲染时间线正文 |
| `recordedAt` | 时间段归类（上午/下午/晚上）；按日推导 dayIndex |
| `dayIndex` | 按天分组 |
| `location.name` | 地点标签（「📍 宽窄巷子」） |
| `images` | 时间线图片展示；站点封面兜底回填 |
| `expenses[].category` | 花费标签（「餐饮」「门票」） |

**不返回**（前端不需要）：
`type` / `city` / `voices` / `audio` / `legacy` / `payload` / `syncVersion` / `status` /
`clientId` / `journeyId` / `journeyTitle` / 旧 `expense` / `expenseAmountCent`

> `expenseAmountCent` 不需要的原因是：手册需要按分类展示（`expenses[].category`），
> 单笔总额无法推断分类。

---

### 4.3 planPlaces（预定点 — 站点九宫格真源）

**排序**：`dayIndex` 升序 → `name` 字典序（前端按此顺序展示站点第 1 站 / 第 2 站…）。

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | string | ✓ | 预定点 clientId |
| `name` | string | ✓ | 地点名 |
| `dayIndex` | number\|null | | 第几天 |
| `lat` | number\|null | | 纬度（用于同名不同坐标的去重） |
| `lng` | number\|null | | 经度 |
| `coverUrl` | string\|null | | 封面图（无则由前端从当天记录照片回填） |
| `images` | string[] | | 图片列表（封面兜底 + 相册聚合） |
| `locationName` | string\|null | | 地址（`name` 为空时的回退名） |

**前端用途**：

| 字段 | 消费位置 |
|------|---------|
| `id` | 站点 id |
| `name` | 站点名（去重 key、展示「第 N 站 · 武侯祠」） |
| `dayIndex` | 站点排序、每日行程链 |
| `lat` / `lng` | 同名异坐标去重 |
| `coverUrl` | 站点网格封面（无则从记录回填） |
| `images` | 旅程相册合集 |
| `locationName` | name 空时降级展示 |

**不返回**（前端不需要）：
`category`（SIGHT/FOOD/STAY…） / `intent`（wish/planned/must） / `note` / `visitTime` /
`recordedAt` / `checks` / `budgetEstimate`

---

## 5. 行为口径（后端保证，已实现确认）

1. **时间格式**：一律 `YYYY-MM-DD HH:mm:ss`
2. **金额单位**：一律「分」
3. **records 排序**：`COALESCE(recordedAt, createdAt)` 降序
4. **planPlaces 排序**：`dayIndex` 升序 → `name` 字典序（`localeCompare`，中文按拼音）；`dayIndex` 为 null 排最后
5. **dayIndex 兜底**：记录与预定点缺 `dayIndex` 时均按 `recordedAt - startDate` 派生（派生不出为 null）
6. **content**：后端直接返回原文（不截断），截断/兜底由前端负责
7. **planPlaces 不返回无 `name` 的点**（纯坐标无名的占位记录不进站点网格）
8. **coverUrl 兜底**：后端取 `coverUrl ?? cover ?? images[0]`；`images` 缺省时回填 `[coverUrl]`（前端仍按文档做记录照片回填兜底）
9. **companions**：已归一化（`solo`/`couple`/`friends`/`family`），实测返回 `["solo"]`
10. **planPlaces.id**：取预定点 `clientId`（`clientId` 缺省时回落 `id`）

---

## 6. 前端改动清单（后端已实现，可直接执行）

### 6.1 `mini/src/api/mappers.ts` — 新增 DTO 与映射

```ts
/** /journeys/handbook/detail 的 records 条目 */
export interface ApiHandbookRecord {
  id: string
  content: string
  recordedAt: string
  dayIndex?: number | null
  location?: { name?: string } | null
  images?: string[] | null
  expenses?: Array<{ amountCent: number; category: string }> | null
}

/** /journeys/handbook/detail 的预定点条目 */
export interface ApiHandbookPlace {
  id: string
  name: string
  dayIndex?: number | null
  lat?: number | null
  lng?: number | null
  coverUrl?: string | null
  images?: string[] | null
  locationName?: string | null
}

export interface HandbookDetailDto {
  journey: ApiJourney
  records: ApiHandbookRecord[]
  planPlaces: ApiHandbookPlace[]
}

export interface MappedHandbookDetail {
  journey: Journey
  records: Recording[]
  planPlaces: PlanPlace[]
}
```

### 6.2 `mini/src/api/mappers.ts` — 新增映射函数

```ts
export function mapHandbookDetail(
  dto: HandbookDetailDto,
  journeyId: string,
): MappedHandbookDetail {
  return {
    journey: mapJourneyListItem({ journey: dto.journey }),
    records: (dto.records || []).map((e) => mapHandbookRecord(e, journeyId)),
    planPlaces: (dto.planPlaces || []).map((p) => mapHandbookPlace(p)),
  }
}

export function mapHandbookRecord(
  e: ApiHandbookRecord,
  journeyId: string,
): Recording {
  const hasImages = e.images?.length
  const expenses: ExpenseItem[] = (e.expenses || [])
    .filter((x) => x.amountCent > 0)
    .map((x) => ({
      amount: x.amountCent,
      currency: 'CNY' as const,
      category: asCategory(x.category),
    }))
  return {
    id: e.id,
    clientId: e.id,
    journeyId,
    type: hasImages ? 'photo' : expenses.length ? 'expense' : 'text',
    content: e.content || '',
    media: hasImages ? e.images!.filter(Boolean) : undefined,
    location: e.location?.name
      ? { lat: 0, lng: 0, name: e.location.name }
      : undefined,
    expenses: expenses.length ? expenses : undefined,
    createdAt: toIsoDateTime(e.recordedAt),
    dayIndex: e.dayIndex ?? 1,
    syncState: 'synced',
  }
}

export function mapHandbookPlace(
  p: ApiHandbookPlace,
): PlanPlace {
  return {
    id: p.id,
    name: p.name,
    dayIndex: p.dayIndex ?? 1,
    lat: p.lat ?? undefined,
    lng: p.lng ?? undefined,
    cover: p.coverUrl || undefined,
    images: p.images || [],
    locationName: p.locationName || undefined,
    category: undefined,
    intent: undefined,
    note: undefined,
    visitTime: undefined,
  }
}
```

### 6.3 `mini/src/api/journey.ts` — 新增方法

```ts
/** 游记预览轻量聚合（与 detail / itemDetail 互斥） */
handbookDetail: async (journeyId: string): Promise<MappedHandbookDetail> => {
  const row = await post<HandbookDetailDto>(
    '/journeys/handbook/detail',
    { journeyId },
    { silent: true },
  )
  return mapHandbookDetail(row, journeyId)
},
```

### 6.4 `useHandbookView.ts` — 替换数据源

```ts
const detail = await journeyApi.handbookDetail(journeyId)
journeyStore.upsert(detail.journey)
recordingStore.replaceForJourney(journeyId, detail.records)
planStore.applyRemote(journeyId, {
  ...planStore.get(journeyId),   // 保留本地扩展字段
  places: detail.planPlaces,
})
```

> 不再需要 catch 兜底中的拆接口逻辑（三个数据源由同一 API 保证，失败直接兜底即可）。

---

## 7. 新旧接口差异对照

| 维度 | 旧 `/journeys/detail` | 新 `/journeys/handbook/detail` |
|------|----------------------|-------------------------------|
| 用途 | 多页面共用（JourneyDetail / HandbookView / …） | 仅 HandbookView |
| journey | 20+ 字段 | 10 字段：id/title/coverUrl/origin/destination/startDate/endDate/status/displayStatus/companions |
| records | 全量 ApiEntry（media/legacy/expenses 明细/voices/payload…） | 7 字段：id/content/recordedAt/dayIndex/location/images/expenses[] |
| plan | places + checks + budgetEstimate | 仅 places（7 字段：id/name/dayIndex/lat/lng/coverUrl/images/locationName） |
| journeyStats | placeCount/recordCount/expenseTotalCent | 无 |
| expense | totalCent/count/byCategory/byDay | 无 |
| guide | exists/canGenerate/stats/全文 | 无 |
| planProgress | checkDone/checkTotal/pct | 无 |
| placesByDay | 无 | 无（手册用 planPlaces 自行聚合站点网格） |

---

## 8. 验收清单

- [ ] `journeyApi.handbookDetail` 调通，返回三块 lean 结构
- [ ] 游记封面：主图/标题/路线/日期/状态/人数正常
- [ ] 站点九宫格：预定点去重正确；无封面时从记录图片回填
- [ ] 时间线：按 `recordedAt` 倒序；日时段分组正常
- [ ] 花费标签：`expenses[].category` 正确渲染（餐饮/住宿/门票/…）
- [ ] 旅程相册：planPlaces.images + records.images 去重后展示
- [ ] 旧 `/journeys/detail` 不受影响（无其他消费方）
- [ ] 断网/失败时兜底逻辑可用