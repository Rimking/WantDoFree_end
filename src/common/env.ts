/**
 * 运行环境判定的唯一出口。
 * 此前「是否生产」的判断散落在 guard / wechat / filter / main / database 五处且
 * 各自读取 NODE_ENV，任何一处拼写不一致都会导致调试守卫放行、Swagger 暴露等错位。
 * 调试能力（mock 支付、模拟登录）必须显式用开关变量打开，而不是「恰好不是 production」：
 * 忘配 / 拼错 NODE_ENV 的线上机不再默认获得开发后门。
 */

export function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** 调试支付通道（/pay/dev-complete、/membership/orders/:no/pay）总开关。 */
export function isDevPayEnabled(): boolean {
  return !isProd() && process.env.ENABLE_DEV_PAY === 'true';
}

/** 模拟登录（code 当 openid / dev_openid_demo 种子映射）总开关。 */
export function isMockLoginEnabled(): boolean {
  return !isProd() && process.env.ENABLE_MOCK_LOGIN === 'true';
}
