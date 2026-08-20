# 前端对接 · 旅程详情页接口拆分：/journeys/item/detail（2026-08-20）

> 后端已实现并编译通过，前端按本文档改造。
> 涉及文件：`mini/src/api/journey.ts`、`mini/src/api/mappers.ts`、`mini/src/pages/JourneyDetail/composables/useJourneyDetail.ts`（及可选 `JourneyMap`）。

---

## 0. 一句话

新增 **`POST /dream/v1/journeys/item/detail`** 作为旅程详情页（JourneyDetail）专用接口，
只返回「旅程基础信息 + 记录时间线 + 花费统计 + 按天地点」四块 lean 数据。
**`/journeys/detail` 保留不动**（已无消费方：游记预览已拆为 `/journeys/handbook/detail`，见《前端对接_游记预览页接口拆分_handbookDetail_2026-08-20.md》）。

---

## 1. 背景

原 `/journeys/detail` 被两个页面共用（JourneyDetail 与 HandbookView），且返回大量前端不消费的字段
（`handbook`、`planProgress`、`plan.checks`、`entries` 的 `media/legacy/expenses` 明细、`expense.byDay` 等），
响应臃肿。本次拆出独立轻量接口，两个页面互不干扰（HandbookView 侧同步拆出 `/journeys/handbook/detail`）。

---

## 2. 接口定义

| 项 | 内容 |
|---|---|
| 方法/路径 | `POST /dream/v1/journeys/item/detail` |
| 鉴权 | `Authorization: Bearer <token>`（JwtAuthGuard） |
| 入参 | `{ "journeyId": "xxx" }`（与 `id` 二选一，必填其一） |
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
    "startDate": "2026-08-01",
    "endDate": "2026-08-04",
    "status": "ongoing",
    "displayStatus": "ongoing",
    "budgetAmount": 300000,
    "themeTags": ["city"],
    "placeCount": 5
  },
  "records": [
    {
      "id": "entry-uuid",
      "clientId": "client-xxx",
      "title": "宽窄巷子人好多",
      "recordedAt": "2026-08-03 18:30:00",
      "dayIndex": 3,
      "location": { "name": "宽窄巷子", "lat": 30.6697, "lng": 104.0562 },
      "images": ["https://.../a.jpg", "https://.../b.jpg"],
      "tags": ["sight", "food"],
      "voices": [{ "url": "https://.../v.m4a", "durationSec": 15 }],
      "expenseAmountCent": 8800,
      "source": null,
      "placeClientId": null
    }
  ],
  "expense": {
    "totalCent": 128400,
    "count": 9,
    "byCategory": [
      { "category": "food", "amountCent": 52000, "count": 5 },
      { "category": "stay", "amountCent": 60000, "count": 2 }
    ]
  },
  "placesByDay": [
    {
      "day": 1,
      "daysList": [
        {
          "id": "place-clientId 或 entry-id",
          "source": "plan_place",
          "name": "武侯祠",
          "lat": 30.6456,
          "lng": 104.0478,
          "dayIndex": 1,
          "recordedAt": "2026-08-01 10:30:00",
          "category": "SIGHT",
          "intent": "must",
          "locationName": "武侯祠大街231号",
          "note": "提前买票",
          "coverUrl": "https://.../place.jpg",
          "images": ["https://.../place.jpg"]
        }
      ]
    },
    { "day": 2, "daysList": [] }
  ]
}
```

### 3.1 journey（旅程基础信息）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 旅程 id |
| `title` | string | 旅程标题 |
| `coverUrl` | string\|null | 主图 |
| `origin` | string\|null | 出发点 |
| `startDate` / `endDate` | string | `YYYY-MM-DD` |
| `status` | string | `planned` \| `ongoing` \| `finished` |
| `displayStatus` | string | `planning` \| `departing` \| `ongoing` \| `finished` \| `draft`（展示态） |
| `budgetAmount` | number\|null | 预算（分） |
| `themeTags` | string[] | 主题标签（归一后） |
| `placeCount` | number | 预定点总数 = `plan.places.length`（含无坐标点） |

> 无 `clientId` / `companions` / `destination` / `createdAt` / `updatedAt` / `recordCount`。
> `recordCount` 由前端从 `records.length` 取。

### 3.2 records（记录时间线）

**排序**：`COALESCE(recordedAt, createdAt)` 降序（记录时间为准，不是创建时间）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 记录 id |
| `clientId` | string\|null | 离线幂等键 |
| `title` | string | 记录标题 = `content` 内容（后端直接填充，空内容为 `""`） |
| `recordedAt` | string | `YYYY-MM-DD HH:mm:ss` |
| `dayIndex` | number\|null | 第几天（1-based） |
| `location` | object\|null | `{ name: string\|null, lat: number\|null, lng: number\|null }` 定位点 |
| `images` | string[] | 图片 URL 列表 |
| `tags` | string[] | 记录标签数组（`records/update` / `entries/create` 写入；无则 `[]`） |
| `voices` | object[] | `[{ url, durationSec }]` 语音列表 |
| `expenseAmountCent` | number | 本条记录花费合计（分），无则 0 |
| `source` | string\|null | `"plan_place"`=预定点占位记录；`null`=普通记录 |
| `placeClientId` | string\|null | 当 `source === "plan_place"` 时，对应预定点 clientId |

> 点击跳转分流沿用现有逻辑：`source === "plan_place"` 进地点页，否则进记一笔编辑。
> 无 `media` / `expenses` 明细 / `legacy` / `city` / `payload` 对象——`source`、`placeClientId` 已拍平。

### 3.3 expense（花费统计）

| 字段 | 类型 | 说明 |
|---|---|---|
| `totalCent` | number | 本旅程花费总额（分） |
| `count` | number | 记账笔数 |
| `byCategory` | object[] | `[{ category, amountCent, count }]` 分类汇总（无 `ratio`，前端自算占比） |

> 无 `byDay`。若花费 Tab 需要按日趋势，走原有 `POST /journeys/expense/summary`。
> 前端可复用现有 `mapExpenseSummary`（`s.byDay || []` 兼容空）。

### 3.4 placesByDay（按天地点，地图数据源）

合并两类点、**已去重**，仅返回**有地点**的天，day 升序，天内按 `recordedAt` 升序：

| 字段 | 类型 | 说明 |
|---|---|---|
| `day` | number | 第几天（1-based） |
| `daysList` | object[] | 当天地点列表 |

每个地点项：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | `source=plan_place` → 预定点 clientId；`source=entry` → 记录 id |
| `source` | string | `"plan_place"`（预定点）\| `"entry"`（自由记录定位点） |
| `name` | string | 地点名（预定点=`name`；记录点=`location.name`） |
| `lat` / `lng` | number | 坐标（仅含有坐标的点） |
| `dayIndex` | number | 第几天 |
| `recordedAt` | string\|null | `YYYY-MM-DD HH:mm:ss`（预定点=visitTime；记录点=recordedAt） |
| `category` | string\|null | 仅预定点有（`SIGHT`/`FOOD`/`STAY`/`SHOPPING`/`OTHER`） |
| `intent` | string\|null | 仅预定点有（`wish`/`planned`/`must`） |
| `locationName` | string\|null | 地址（预定点=locationName；记录点=location.name） |
| `note` | string\|null | 仅预定点有（备注） |
| `coverUrl` | string\|null | 封面（预定点=coverUrl；记录点=首图） |
| `images` | string[] | 图片 URL 列表 |

> **去重规则**：预定点生成的占位记录（`source=plan_place`）不再作为 `entry` 重复出现；
> 预定点无坐标的不进地图（纯文字备忘）；记录无定位的不进地图。
> 点击跳转：`source=plan_place` 进地点编辑页（`PlanPlaceForm?id=&placeId=`），`source=entry` 进记一笔编辑。

---

## 4. 行为口径（后端保证）

1. **时间格式**：一律 `YYYY-MM-DD HH:mm:ss`
2. **金额单位**：一律「分」
3. **records 排序**：`COALESCE(recordedAt, createdAt)` 降序
4. **placesByDay 排序**：day 升序 → 天内 recordedAt 升序；空天的 `daysList` 为 `[]`（上例 day 2 仅为演示，实际**空天不会返回**）
5. **dayIndex 兜底**：记录/预定点缺 `dayIndex` 时按 `recordedAt - startDate` 派生，派生不出则不进入 placesByDay
6. **title**：后端直接返回 `content` 原文（不截断），截断/兜底展示由前端负责
7. **placeCount**：等于全部预定点数（含无坐标点），供「N 个预定点已串成路线」文案

---

## 5. 前端改动清单

### 5.1 `mini/src/api/journey.ts` — 新增方法

```ts
/** 旅程详情页 lean 聚合（与 detail 互斥；detail 留给游记预览） */
itemDetail: async (journeyId: string): Promise<MappedJourneyItemDetail> => {
  const row = await post<JourneyItemDetailDto>(
    '/journeys/item/detail',
    { journeyId },
    { silent: true },
  )
  return mapJourneyItemDetail(row, journeyId)
},
```

### 5.2 `mini/src/api/mappers.ts` — 新增映射

```ts
export function mapJourneyItemDetail(
  dto: JourneyItemDetailDto,
  journeyId: string,
): MappedJourneyItemDetail {
  return {
    journey: dto.journey,                        // 轻量 journey 直接落 store
    records: (dto.records || []).map((e) => mapItemRecord(e, journeyId)),
    expense: mapExpenseSummary(dto.expense, journeyId),  // 复用现有 mapper，byDay 空兼容
    placesByDay: dto.placesByDay || [],
  }
}

export function mapItemRecord(e: ApiItemRecord, journeyId: string): Recording {
  // title 直接用 e.title；location/images/voices/expenseAmountCent/source/placeClientId 原样透传
  return { ...e, journeyId }
}
```

> `mapExpenseSummary` 现有实现 `s.byDay || []` 天然兼容无 `byDay` 的响应，无需改。

### 5.3 `JourneyDetail/composables/useJourneyDetail.ts` — 数据落位

`refreshDetail` 由 `journeyApi.detail(journeyId, ['entries','plan','expense','guide'])` 改为：

```ts
const detail = await journeyApi.itemDetail(journeyId)

journeyStore.upsert(detail.journey)              // placeCount 已含在 journey 内，无需再 merge journeyStats
recordingStore.replaceForJourney(journeyId, detail.records)
expenseStore.setJourneySummary(journeyId, detail.expense)
```

**三个需要额外处理的口径变化：**

1. **guide 不再返回** —— 「生成游记/查看游记」按钮状态改为独立拉取：
   ```ts
   // hasGuide / handbookPhase 的数据源改为：
   const g = await guideApi.check(journeyId)   // POST /journeys/guide/get
   guideStore.setGuideMeta(journeyId, g)
   ```
   > 原 `detail.guide` 喂 `guideStore` 的路径消失，必须补这一步，否则游记按钮状态失效。

2. **recordCount 不再返回** —— 原来 `journey.recordCount`（来自 journeyStats），现改为：
   ```ts
   const recordCount = detail.records.length
   ```

3. **plan 不再返回** —— 编辑预定点（`goEditPlace`）需要完整预定点数据：
   - 方案 A（推荐，改动最小）：保留一次 `planApi.get(journeyId)` 喂 `planStore`，地图/编辑页沿用现状；`placesByDay` 暂不消费
   - 方案 B（省一次请求）：地图与编辑页改用 `placesByDay`（`source=plan_place` 的项字段已足够），不再依赖 `planStore.places`

   两种方案二选一即可，`placesByDay` 与「plan.places + 记录定位点」数据等价（已去重）。

### 5.4 兜底逻辑

`refreshDetail` 的 catch 兜底（拆接口 Promise.all）建议保留并同步调整：
`journeyStore.fetchById` + `recordingStore.fetchForJourney` + `expenseStore.fetchJourneySummary` + `planStore.fetchPlan` + `guideApi.check`。

---

## 6. 新旧接口差异对照

| 维度 | 旧 `/journeys/detail` | 新 `/journeys/item/detail` |
|---|---|---|
| 用途 | JourneyDetail + HandbookView 共用 | 仅 JourneyDetail |
| journey | 含 clientId/destination/companions/createdAt/updatedAt | 精简：title/coverUrl/origin/时间/status/displayStatus/budgetAmount/themeTags/placeCount |
| journeyStats | placeCount/recordCount/expenseTotalCent | 无（placeCount 并入 journey；recordCount 用 records.length） |
| planProgress | checkDone/checkTotal/pct | 无 |
| handbook | phase/shareSummary/... | 无 |
| entries | 全量 toEntryModule（media/legacy/expenses 明细） | records 轻量（title/location/images/voices/expenseAmountCent/source/placeClientId） |
| plan | places + checks + budgetEstimate | 无（placesByDay 替代只读场景；编辑预定点另拉 plan/get） |
| expense | totalCent/count/byCategory/byDay | totalCent/count/byCategory（无 byDay/ratio） |
| guide | exists/canGenerate/... | 无（改走 /journeys/guide/get） |
| placesByDay | 无（前端自行合并 plan.places + 记录定位） | 有（后端合并去重、按天分组） |

**HandbookView（游记预览）不改**，继续使用 `/journeys/detail` → **已改为使用新接口 `/journeys/handbook/detail`**（见《前端对接_游记预览页接口拆分_handbookDetail_2026-08-20.md》）。

---

## 7. 验收清单

- [ ] `journeyApi.itemDetail` 调通，返回四块 lean 结构
- [ ] JourneyDetail 页头部：主图/标题/时间/状态/出发点/预算/主题 正常
- [ ] 记录时间线：按 `recordedAt` 倒序；预定点占位记录带「预定地点」标签（`source=plan_place`）
- [ ] 花费 Tab：总额/笔数/分类占比正常（无 byDay 不影响）
- [ ] 行程地图：`placesByDay` 预定点 + 自由定位点不重复；点击跳转分流正确
- [ ] 「生成游记」按钮状态正常（guide 独立拉取后）
- [ ] 游记预览（HandbookView）不受影响
- [ ] 断网/失败时兜底拆接口逻辑可用
