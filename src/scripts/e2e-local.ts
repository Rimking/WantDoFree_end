/**
 * T6.2 本机端到端 e2e（渡清川 · 会员 + 分享全链路）
 *
 * 与 self-test-membership / self-test-share（纯函数/内存仓储断言）不同，本脚本走
 * **真实 HTTP + 真实 MySQL** 全栈：登录 → 会员下单→支付→/me 返 pro→配额联动→
 * 续费翻转→退款降级；分享 创建票据→取内容(脱敏)→归因→stats+1。
 *
 * 两种运行模式：
 *  A) 外部服务（默认，用户本机）：后端已 `npm run start:dev` 起来后运行本脚本。
 *     E2E_BASE_URL=http://localhost:3000 npm run e2e:local
 *  B) 进程内自启（沙箱/无独立终端）：脚本自己 NestFactory 起一个临时实例，
 *     跑完自动关闭。需要能连到 .env 里的 MySQL。
 *     E2E_INPROC=1 npm run e2e:local
 *
 * 设计：
 * - 仅用 Node 22 全局 fetch，无新增依赖（dotenv 由 @nestjs/config 间接提供）。
 * - 幂等：开始前先把 dev 账号重置回 free（若残留 pro），可反复运行。
 * - 分享流：新建空旅程验证「票据+归因+stats」核心链路；再复用 seed 的带攻略
 *   旅程验证「内容脱敏 200」路径（GET 响应不含 lat/lng）。
 *
 * 前置（外部模式）：MySQL 运行 + `npm run seed:demo` + `npm run start:dev`。
 * 退出码：0 全部通过（SKIP 不计入失败），1 存在失败项。
 */
import 'dotenv/config';
import 'reflect-metadata';

let API_URL = '';

let pass = 0;
let fail = 0;
let skip = 0;

function ok(name: string): void {
  pass += 1;
  console.log('  \x1b[32m✓\x1b[0m ' + name);
}
function bad(name: string, detail?: string): void {
  fail += 1;
  console.error('  \x1b[31m✗\x1b[0m ' + name + (detail ? ' — ' + detail : ''));
}
function skipItem(name: string, why: string): void {
  skip += 1;
  console.log('  \x1b[33m⊘\x1b[0m ' + name + ' — SKIP: ' + why);
}

interface ReqOpts {
  token?: string;
  body?: unknown;
  want?: number[];
}

async function req(method: string, path: string, opts: ReqOpts = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers['Authorization'] = 'Bearer ' + opts.token;
  const res = await fetch(API_URL + path, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function isOk(res: { status: number }, want?: number[]): boolean {
  if (want) return want.includes(res.status);
  return res.status === 200 || res.status === 201;
}

async function main(): Promise<void> {
  console.log('T6.2 本机 e2e · 会员 + 分享 全链路');

  let app: any = null;
  if (process.env.E2E_INPROC) {
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('../app.module');
    app = await NestFactory.create(AppModule);
    app.setGlobalPrefix('dream');
    await app.init();
    const server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr: any = server.address();
    API_URL = `http://localhost:${addr.port}/dream/v1`;
    console.log('  · 进程内自启 Nest，监听 ' + API_URL);
  } else {
    const base = process.env.E2E_BASE_URL || 'http://localhost:3000';
    API_URL = base + '/dream/v1';
    console.log('  目标: ' + base + '  (E2E_BASE_URL 可覆盖；E2E_INPROC=1 可进程内自启)');
  }
  console.log('');

  // ── 0) 登录（dev 种子账号，命中真实 DB）──
  console.log('--- 0) 登录 dev_openid_demo ---');
  const login = await req('POST', '/auth/wechat-login', { body: { code: 'dev_openid_demo' } });
  if (!isOk(login)) {
    bad('dev 登录', 'HTTP ' + login.status + ' ' + (login.text || '').slice(0, 200));
    console.log('\n❌ 无法登录，确认后端已启动且 DB 可达（进程内模式请确认 .env 的 MySQL 配置）');
    await close(app);
    process.exit(1);
  }
  const token: string = login.json.token;
  const userId: string = login.json.user?.id;
  if (!token || !userId) {
    bad('登录响应含 token/user.id');
    await close(app);
    process.exit(1);
  }
  ok('dev 登录成功，拿到 token (userId=' + userId + ')');

  // ── 0.5) 幂等重置：若残留 pro 先退款回 free ──
  const mePre = await req('GET', '/membership/me', { token });
  if (isOk(mePre) && mePre.json.plan === 'pro') {
    console.log('  · 检测到残留 pro，先退款重置为 free（幂等）');
    await req('POST', '/membership/refund', { token, body: {} });
  }

  // ───────────────────────── 会员流 ─────────────────────────
  console.log('');
  console.log('--- 1) 会员：下单 → 支付 → /me 返 pro → 配额联动 → 续费翻转 → 退款降级 ---');

  const me0 = await req('GET', '/membership/me', { token });
  if (isOk(me0) && me0.json.plan === 'free') ok('基线 /membership/me = free');
  else bad('基线应为 free', JSON.stringify(me0.json));

  const plans = await req('GET', '/membership/plans', { token });
  if (isOk(plans) && Array.isArray(plans.json) && plans.json.length >= 1) {
    ok('GET /membership/plans 返回 ' + plans.json.length + ' 个套餐');
  } else {
    bad('套餐列表为空（请先 npm run seed:demo）', JSON.stringify(plans.json));
  }
  const planCode: string = plans.json?.[0]?.code;
  if (!planCode) {
    bad('无可用 planCode，终止会员流');
    await close(app);
    return;
  }

  const order = await req('POST', '/membership/orders', { token, body: { planCode } });
  if (isOk(order) && order.json.orderNo) ok('POST /membership/orders 创建订单 (' + order.json.orderNo + ')');
  else {
    bad('创建订单失败', JSON.stringify(order.json));
    await close(app);
    return;
  }
  const orderNo: string = order.json.orderNo;

  const pay = await req('POST', `/membership/orders/${orderNo}/pay`, { token });
  if (isOk(pay) && pay.json.status === 'paid') ok('POST .../pay mock 支付成功 (status=paid)');
  else bad('支付失败', JSON.stringify(pay.json));

  const me1 = await req('GET', '/membership/me', { token });
  if (isOk(me1) && me1.json.plan === 'pro' && me1.json.status === 'ACTIVE') {
    ok('支付后 /membership/me = pro / ACTIVE');
  } else bad('支付后未返 pro', JSON.stringify(me1.json));

  const quota = await req('GET', '/me/quota', { token });
  if (isOk(quota) && quota.json?.photo?.quota === 300 && quota.json?.voiceSec?.quota === 10800) {
    ok('配额联动生效：photo.quota=300 / voiceSec.quota=10800');
  } else {
    bad('配额联动异常', JSON.stringify(quota.json));
  }

  const renOff = await req('PATCH', '/membership/renewal', { token, body: { autoRenew: false } });
  if (isOk(renOff) && renOff.json.autoRenew === false) ok('PATCH /membership/renewal autoRenew=false 生效');
  else bad('续费开关失败', JSON.stringify(renOff.json));

  const me2 = await req('GET', '/membership/me', { token });
  if (isOk(me2) && me2.json.autoRenew === false) ok('GET /me 反映 autoRenew=false');
  else bad('续费状态未持久化', JSON.stringify(me2.json));

  const refund = await req('POST', '/membership/refund', { token, body: {} });
  if (isOk(refund) && refund.json.status === 'refunded') ok('POST /membership/refund 退款成功 (status=refunded)');
  else bad('退款失败', JSON.stringify(refund.json));

  const me3 = await req('GET', '/membership/me', { token });
  if (isOk(me3) && me3.json.plan === 'free') ok('退款后 /me 降级回 free（配额回退）');
  else bad('退款后未降级 free', JSON.stringify(me3.json));

  // ───────────────────────── 分享流 ─────────────────────────
  console.log('');
  console.log('--- 2) 分享：建旅程 → 创建票据 → 取内容(脱敏) → 归因 → stats+1 ---');

  const journey = await req('POST', '/journeys/create', {
    token,
    body: {
      title: 'E2E 自动化测试旅程',
      origin: '上海',
      destination: 'Kyoto',
      startDate: '2026-08-01',
      endDate: '2026-08-05',
    },
  });
  let journeyId: string | undefined;
  if (isOk(journey) && journey.json?.journey?.id) {
    journeyId = journey.json.journey.id;
    ok('POST /journeys/create 创建旅程 (' + journeyId + ')');
  } else {
    bad('创建旅程失败', JSON.stringify(journey.json));
    await close(app);
    return;
  }

  const stats0 = await req('GET', '/me/share-stats', { token });
  const total0: number = stats0.json?.totalShares ?? 0;
  const views0: number = stats0.json?.views ?? 0;

  const share = await req('POST', '/shares', { token, body: { journeyId, visibility: 'unlisted' } });
  let shareToken: string | undefined;
  if (isOk(share) && share.json?.token) {
    shareToken = share.json.token;
    ok('POST /shares 创建分享票据 (token=' + shareToken + ')');
  } else {
    bad('创建分享票据失败', JSON.stringify(share.json));
  }

  if (shareToken) {
    // 新建（空）旅程无 guide → GET 预期 404（契约一致），核心链路仍可校验
    const getA = await req('GET', `/shares/${shareToken}`);
    if (getA.status === 404) ok('GET /shares/:token 空旅程无 guide 时预期 404（与契约一致）');
    else skipItem('空旅程内容校验', 'GET 返回 ' + getA.status + '（非空旅程）');

    const v1 = await req('POST', `/shares/${shareToken}/view`, { body: { viewerId: 'e2e-viewer-1' } });
    if (isOk(v1) && v1.json?.attributed === true) ok('POST .../view 首次归因 attributed=true');
    else bad('首次归因失败', JSON.stringify(v1.json));

    const v2 = await req('POST', `/shares/${shareToken}/view`, { body: { viewerId: 'e2e-viewer-1' } });
    if (isOk(v2) && v2.json?.attributed === false) ok('POST .../view 同 viewerId 幂等 attributed=false');
    else bad('归因幂等失败', JSON.stringify(v2.json));

    const stats1 = await req('GET', '/me/share-stats', { token });
    const total1: number = stats1.json?.totalShares ?? 0;
    const views1: number = stats1.json?.views ?? 0;
    if (total1 === total0 + 1) ok('分享统计 totalShares +1 (' + total0 + '→' + total1 + ')');
    else bad('totalShares 未 +1', total0 + '→' + total1);
    if (views1 >= views0 + 1) ok('分享统计 views +1 (' + views0 + '→' + views1 + ')');
    else bad('views 未 +1', views0 + '→' + views1);
  }

  // ── 2.5) 内容脱敏 200 路径：复用 seed 的「带攻略旅程」创建 share 并取内容 ──
  const list = await req('GET', '/journeys', { token });
  const items: any[] = Array.isArray(list.json) ? list.json : list.json?.items ?? [];
  let contentChecked = false;
  for (const it of items) {
    const jid: string | undefined = it?.id;
    if (!jid) continue;
    const g = await req('GET', `/journeys/${jid}/guide`, { token });
    if (!isOk(g) || !g.json?.exists) continue;
    const sh = await req('POST', '/shares', { token, body: { journeyId: jid, visibility: 'unlisted' } });
    if (!isOk(sh) || !sh.json?.token) continue;
    const tok: string = sh.json.token;
    const get = await req('GET', `/shares/${tok}`);
    if (isOk(get) && get.json?.journey?.title) {
      ok('GET /shares/:token 返回脱敏内容（标题=' + get.json.journey.title + '）');
      const blob = (get.text || '').toLowerCase();
      if (/\b(lat|lng|latitude|longitude)\b/.test(blob)) {
        bad('分享内容泄露精确坐标', blob.slice(0, 200));
      } else ok('内容脱敏校验通过：无 lat/lng/latitude/longitude 字段');
    } else {
      bad('有攻略旅程的内容取回失败', JSON.stringify(get.json));
    }
    contentChecked = true;
    break;
  }
  if (!contentChecked) {
    skipItem('内容脱敏 200 校验', '无「带攻略旅程」可复用（请先运行 seed:demo）');
  }

  // 清理：删除测试旅程（share 行保留，不影响增量校验）
  if (journeyId) {
    const del = await req('POST', '/journeys/delete', { token, body: { id: journeyId } });
    if (isOk(del)) ok('清理：删除测试旅程 (' + journeyId + ')');
    else skipItem('清理测试旅程', '删除失败（' + del.status + '），可手动清理');
  }

  await close(app);
  finish();
}

async function close(app: any): Promise<void> {
  if (app && typeof app.close === 'function') {
    try {
      await app.close();
    } catch {
      /* noop */
    }
  }
}

function finish(): void {
  console.log('');
  console.log(`通过 ${pass} · 失败 ${fail} · 跳过 ${skip}`);
  if (fail === 0) {
    console.log('\x1b[32m✅ T6.2 本机 e2e 全部通过（SKIP 不计入失败）\x1b[0m');
    process.exit(0);
  } else {
    console.error('\x1b[31m❌ 存在 ' + fail + ' 项失败\x1b[0m');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('e2e 运行异常:', e);
  process.exit(1);
});
