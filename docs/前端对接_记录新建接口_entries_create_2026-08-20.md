# 前端对接 · 记录新建接口：/journeys/entries/create（2026-08-20）

> **✅ 后端已实现并实测通过（2026-08-20）**：`POST /dream/v1/journeys/entries/create` 已上线；
> **`/journeys/entries/sync` 已下线（404）**。本文件即最终契约，前端按下文清单实施。
> 媒体关联方式：**上传接口返回 mediaId，create 时传 `mediaIds`，后端直接关联**（图片、语音通用）。
> 涉及文件：`mini/src/api/recording.ts`、`mini/src/api/mappers.ts`、`mini/src/stores/recording.ts`、`mini/src/lib/uploadMedia.ts`、`mini/src/lib/outbox.ts`、`mini/src/types`（可选）

---

## 0. 一句话

用户提交一条记录 = **一次调用**传一个对象（含该记录全部信息），不再有 `clientId`、`city`、批量数组。
`/journeys/entries/sync` 完成迁移后**不再提供**。

---

## 1. 背景

旧 sync 是批量 upsert 接口，为离线队列设计；「新建一条记录」场景下：
- 需要传 `clientId`（幂等键），但新建场景前端防重即可，无此必要
- 语音记录要先 sync 建 entry 拿 id 再上传，**两次保存调用**
- `city` 字段无实际消费方

新接口改为单条对象一次提交；媒体走「先上传拿 mediaId，create 时传 `mediaIds`」——上传与创建天然分离，后端按 id 直接关联，不需要再按 URL 匹配。

---

## 2. 接口定义

| 项 | 内容 |
|---|---|
| 方法/路径 | `POST /dream/v1/journeys/entries/create` |
| 鉴权 | `Authorization: Bearer <token>`（JwtAuthGuard） |
| 入参 | 单条记录对象（见 §3） |
| 出参 | 创建后的记录摘要（见 §4） |
| 错误 | 旅程不存在/无权 → 404；recordedAt 格式错误 → 400；超出旅程时间范围 → 400 |

---

## 3. 请求体（单条对象）

```json
{
  "journeyId": "b1e6...",
  "recordedAt": "2026-08-03 18:30:00",
  "content": "宽窄巷子人好多",
  "dayIndex": 3,
  "location": { "lat": 30.6697, "lng": 104.0562, "name": "宽窄巷子" },
  "mediaIds": [
    "c4e86a00-9c99-11f1-8971-249a9a3745b1",
    "c4e86a00-9c99-11f1-8971-249a9a3745b2"
  ],
  "expenses": [
    { "amountCent": 8000, "category": "food" }
  ],
  "tags": ["sight", "food"]
}
```

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `journeyId` | ✅ | string | 定位旅程 |
| `recordedAt` | ✅ | string | `YYYY-MM-DD HH:mm:ss`，须在旅程起止范围内 |
| `content` | 选 | string | 文字内容 |
| `dayIndex` | 选 | number | 第几天（1-based）；不传为 null |
| `location` | 选 | object | `{ lat, lng, name? }`，lat ∈ [-90,90]、lng ∈ [-180,180] |
| `mediaIds` | 选 | array ≤20 | **已上传媒体的 id**（`/media/confirm` 响应的 `id`），图片、语音都传 id；后端直接关联 |
| `expenses` | 选 | array ≤20 | `{ amountCent, category, currency?, note? }`；amountCent 单位分，category ∈ food/stay/transport/ticket/shopping/other（兼容中文别名） |
| `tags` | 选 | array ≤10 | 标签字符串数组（如 `["sight","food"]`），后端原样存储，响应顶层 `tags` 返回 |

**不包含**：`clientId`、`city`、`type`（后端按内容自动推导 text/photo/voice/location/expense）、`payload`、`media`（URL 数组）。

---

## 4. 响应

```json
{
  "id": "0e764bf5-a4cd-41a7-b6c3-a5cbf6c282bb",
  "type": "photo",
  "recordedAt": "2026-08-21 11:00:00",
  "dayIndex": 2
}
```

| 字段 | 说明 |
|---|---|
| `id` | 服务端 entry id，**前端用它回填本地记录**（替代旧 sync 的 clientId↔id 映射） |
| `type` | 推导出的记录类型 |
| `recordedAt` / `dayIndex` | 落库后的时间与天数（回显） |

---

## 5. 行为口径（后端保证，已实测）

1. **一次调用完成**：entry + 定位 + 花费 + 媒体全部落库（事务）
2. **媒体按 mediaId 关联**：上传时 `/media/confirm` 已计配额，create 时只做归属——校验每个 id 属于当前用户、状态 active、未被其他记录占用，然后 `ownerId` 指向本条记录；传了不存在的 id / 已被占用的 id → 400（事务回滚，无残留）。图片、语音同一套
3. **幂等**：无 clientId，重复提交会重复建记录 → **前端保存按钮必须防重**（loading 禁用 + 失败明确提示，不静默重试）
4. **配额**：上传即计（`/media/confirm` 时），create 不重复计；外部直链 URL 不再走本接口
5. **时间**：recordedAt 超出旅程 [startDate, endDate] → 400；格式错误 → 400

---

## 6. 前端改动清单

### 6.1 `mini/src/lib/uploadMedia.ts` — 语音上传不再需要 entry；保留返回的 id

```ts
// 现：图片上传时不关联记录，由保存时 images 数组建立关联
const skipOwner = input.ownerType === 'entry' && input.kind === 'image'
// 改：entry 类型媒体一律不传 ownerId（语音同样先传后关联）
const skipOwner = input.ownerType === 'entry'
```

> 后端 `/media/prepare` 的 ownerId 本就可选（传了才校验），改后图片/语音均可先上传、后由 create 关联。
> 上传链路 `/media/prepare → 上传 → /media/confirm` 返回的媒体对象**已含 `id`**——前端保存时收集这些 id 传给 create（见 6.2/6.4），不要用 URL 做关联。

### 6.2 `mini/src/api/mappers.ts` — `toEntrySyncBody` 改造为 `toEntryCreateBody`

```ts
/** /journeys/entries/create 请求体：单条、无 clientId/city/type；媒体传已上传的 mediaId */
export function toEntryCreateBody(r: Recording) {
  const expenses = (r.expenses || []).map((e) => ({
    amountCent: Math.round(e.amount || 0),
    category: asCategory(e.category),
    ...(e.currency && e.currency !== 'CNY' ? { currency: e.currency } : {}),
    ...(e.note ? { note: e.note } : {}),
  }))
  return {
    journeyId: r.journeyId,
    recordedAt: formatApiDateTime(r.createdAt),
    ...(r.content ? { content: r.content } : {}),
    ...(r.dayIndex != null ? { dayIndex: r.dayIndex } : {}),
    ...(r.location?.name ? { location: { name: r.location.name, lat: r.location.lat, lng: r.location.lng } } : {}),
    ...(expenses.length ? { expenses } : {}),
    ...(r.mediaIds?.length ? { mediaIds: r.mediaIds } : {}),
  }
}
```

> 旧 `toEntrySyncBody`（含 clientId/payload/type/city/media URL 数组/voices 结构）可删除。
> `Recording.mediaIds?: string[]`：新建时本次上传的媒体 id（`/media/confirm` 返回值收集而来，图片、语音统一收集）；`r.media`（URL）仅用于展示，不再参与提交。
> **编辑记录不受影响**：仍走 `/records/update` 的 `images` URL 数组（后端已按 storageKey 兜底），勿改动该链路。

### 6.3 `mini/src/api/recording.ts` — sync → create

```ts
/** 新建记录（单条，一次调用）；返回服务端 id 用于回填 */
create: async (r: Recording) =>
  post<{ id: string; type: string; recordedAt: string; dayIndex: number | null }>(
    '/journeys/entries/create',
    toEntryCreateBody(r),
    { silent: true },
  ),
```

> 删除 `sync` 方法。

### 6.4 `mini/src/stores/recording.ts` — 数据落位

1. **`pushRemote`**：`recordingApi.sync(ready.journeyId, [ready])` + clientId 命中映射
   → 改为 `const res = await recordingApi.create(ready)`，`cur.id = res.id`（clientId 逻辑删除）
2. **`ensureMediaUploaded`**：删除「本地语音需先 sync 建 entry」分支（line ~361-373），
   语音上传后直接由 create 关联；`ownerId` 参数不再传（见 6.1）；
   **上传成功后把 `/media/confirm` 返回的 `id` 收集进 `rec.mediaIds`**（图片、语音统一收集，先传的先排前）
3. **`pushUpdate` / `updateTime` / 其余**：`recordings.value.find((x) => x.clientId === rec.clientId)`
   → 改为 `find((x) => x.id === rec.id)`（同步后本地 id 已替换为服务端 id）
4. **`add` / `addAndSync`**：本地 id 生成保留（`genId('r')`），`clientId` 生成删除；
   `Recording` 类型移除 `clientId`、新增 `mediaIds?: string[]`（`Omit<...>` 中同步调整）

### 6.5 `mini/src/lib/outbox.ts` — 重放改走 create

```ts
if (it.resource === 'recording') {
  const journeyId = String(p.journeyId || '')
  if (it.op === 'sync' || it.op === 'create' || it.op === 'update') {
    const entry = p as unknown as Recording
    await request('/journeys/entries/create', {
      method: 'POST',
      data: toEntryCreateBody(entry),
      silent: true,
    })
    return
  }
  ...
}
```

> 注意：离线重放无幂等键，重放前先本地去重（`id` 已是服务端 id 的不再 create，改走 `/records/update`）；
> 或接受「断网重放可能重复」的产品取舍，由用户手动删。

### 6.6 `mini/src/types`（可选）

`Recording` 类型移除 `clientId` 字段；所有 `Omit<Recording, 'id' | 'clientId' | ...>` 同步去掉 `clientId`。

---

## 7. 新旧接口差异对照

| 维度 | 旧 `/journeys/entries/sync` | 新 `/journeys/entries/create` |
|---|---|---|
| 入参 | `{ journeyId, entries: [...] }` 批量数组 | 单条记录对象 |
| clientId | 必填（幂等键） | **无**（前端防重） |
| city | 可选 | **无** |
| type | 可选 | 无（后端推导） |
| payload | 可选透传 | 无 |
| 媒体关联 | 语音需先建 entry（两次调用） | 上传返回 mediaId → create 传 `mediaIds`，一次关联 |
| 响应 | `{ synced: [{clientId, id, ...}] }` | `{ id, type, recordedAt, dayIndex }` |
| 离线重放 | 幂等安全 | 无幂等，需前端去重或接受重复 |

---

## 8. 验收清单

- [ ] `recordingApi.create` 调通：无媒体 / 带图 / 带语音 / 带定位 / 带花费 各场景一次创建成功
- [ ] 语音记录**不再二次调用**（上传与创建各一次）
- [ ] 返回 `id` 回填本地记录，再次编辑走 `/records/update` 正常
- [ ] 媒体关联正确：上传 → create 传 `mediaIds` → 服务端 media 行 `ownerId` 指向新 entry；同 id 二次使用被拒（400）
- [ ] 保存按钮防重生效；失败 toast 提示，不静默重试
- [ ] 断网入队 → 恢复后重放成功（或按产品决策去重）
- [ ] 旧 `entries/sync` 不再被任何代码调用（404 已验证）
- [ ] 预定点占位记录（plan_place）创建不受影响（内部链路，不经过本接口）
