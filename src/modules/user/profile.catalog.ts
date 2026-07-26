/** 常用行政区划（6 位国标码）：省/市展示与 cityCode 白名单校验。 */

export type RegionCity = {
  provinceCode: string;
  provinceName: string;
  cityCode: string;
  cityName: string;
};

const CITIES: RegionCity[] = [
  { provinceCode: '110000', provinceName: '北京', cityCode: '110100', cityName: '北京' },
  { provinceCode: '310000', provinceName: '上海', cityCode: '310100', cityName: '上海' },
  { provinceCode: '440000', provinceName: '广东', cityCode: '440100', cityName: '广州' },
  { provinceCode: '440000', provinceName: '广东', cityCode: '440300', cityName: '深圳' },
  { provinceCode: '330000', provinceName: '浙江', cityCode: '330100', cityName: '杭州' },
  { provinceCode: '330000', provinceName: '浙江', cityCode: '330200', cityName: '宁波' },
  { provinceCode: '320000', provinceName: '江苏', cityCode: '320100', cityName: '南京' },
  { provinceCode: '320000', provinceName: '江苏', cityCode: '320500', cityName: '苏州' },
  { provinceCode: '510000', provinceName: '四川', cityCode: '510100', cityName: '成都' },
  { provinceCode: '500000', provinceName: '重庆', cityCode: '500100', cityName: '重庆' },
  { provinceCode: '420000', provinceName: '湖北', cityCode: '420100', cityName: '武汉' },
  { provinceCode: '410000', provinceName: '河南', cityCode: '410100', cityName: '郑州' },
  { provinceCode: '610000', provinceName: '陕西', cityCode: '610100', cityName: '西安' },
  { provinceCode: '370000', provinceName: '山东', cityCode: '370100', cityName: '济南' },
  { provinceCode: '370000', provinceName: '山东', cityCode: '370200', cityName: '青岛' },
  { provinceCode: '350000', provinceName: '福建', cityCode: '350100', cityName: '福州' },
  { provinceCode: '350000', provinceName: '福建', cityCode: '350200', cityName: '厦门' },
  { provinceCode: '530000', provinceName: '云南', cityCode: '530100', cityName: '昆明' },
  { provinceCode: '530000', provinceName: '云南', cityCode: '532900', cityName: '大理' },
  { provinceCode: '450000', provinceName: '广西', cityCode: '450100', cityName: '南宁' },
  { provinceCode: '460000', provinceName: '海南', cityCode: '460100', cityName: '海口' },
  { provinceCode: '460000', provinceName: '海南', cityCode: '460200', cityName: '三亚' },
  { provinceCode: '210000', provinceName: '辽宁', cityCode: '210100', cityName: '沈阳' },
  { provinceCode: '210000', provinceName: '辽宁', cityCode: '210200', cityName: '大连' },
  { provinceCode: '120000', provinceName: '天津', cityCode: '120100', cityName: '天津' },
  { provinceCode: '340000', provinceName: '安徽', cityCode: '340100', cityName: '合肥' },
  { provinceCode: '360000', provinceName: '江西', cityCode: '360100', cityName: '南昌' },
  { provinceCode: '430000', provinceName: '湖南', cityCode: '430100', cityName: '长沙' },
  { provinceCode: '520000', provinceName: '贵州', cityCode: '520100', cityName: '贵阳' },
  { provinceCode: '140000', provinceName: '山西', cityCode: '140100', cityName: '太原' },
  { provinceCode: '130000', provinceName: '河北', cityCode: '130100', cityName: '石家庄' },
  { provinceCode: '150000', provinceName: '内蒙古', cityCode: '150100', cityName: '呼和浩特' },
  { provinceCode: '220000', provinceName: '吉林', cityCode: '220100', cityName: '长春' },
  { provinceCode: '230000', provinceName: '黑龙江', cityCode: '230100', cityName: '哈尔滨' },
  { provinceCode: '620000', provinceName: '甘肃', cityCode: '620100', cityName: '兰州' },
  { provinceCode: '630000', provinceName: '青海', cityCode: '630100', cityName: '西宁' },
  { provinceCode: '640000', provinceName: '宁夏', cityCode: '640100', cityName: '银川' },
  { provinceCode: '650000', provinceName: '新疆', cityCode: '650100', cityName: '乌鲁木齐' },
  { provinceCode: '540000', provinceName: '西藏', cityCode: '540100', cityName: '拉萨' },
];

const byCity = new Map(CITIES.map((c) => [c.cityCode, c]));

export function findCity(cityCode: string): RegionCity | undefined {
  return byCity.get(cityCode);
}

export function formatRegion(provinceCode?: string | null, cityCode?: string | null): string | null {
  if (!cityCode) return null;
  const c = byCity.get(cityCode);
  if (!c) return null;
  if (provinceCode && provinceCode !== c.provinceCode) return null;
  return `${c.provinceName}·${c.cityName}`;
}

export function listProvinces() {
  const map = new Map<string, { code: string; name: string; cities: { code: string; name: string }[] }>();
  for (const c of CITIES) {
    let p = map.get(c.provinceCode);
    if (!p) {
      p = { code: c.provinceCode, name: c.provinceName, cities: [] };
      map.set(c.provinceCode, p);
    }
    p.cities.push({ code: c.cityCode, name: c.cityName });
  }
  return [...map.values()];
}

export const TRAVEL_IDENTITIES = [
  { code: 'backpacker', name: '背包客', sort: 1 },
  { code: 'foodie', name: '美食猎人', sort: 2 },
  { code: 'vacationer', name: '度假党', sort: 3 },
  { code: 'photo', name: '摄影控', sort: 4 },
  { code: 'culture', name: '人文探索', sort: 5 },
  { code: 'outdoor', name: '户外徒步', sort: 6 },
  { code: 'family', name: '亲子同游', sort: 7 },
] as const;

export const IDENTITY_MAX_SELECT = 3;

const SENSITIVE = ['傻逼', '共产党', '法轮', '微信官方', '管理员'];

export function containsSensitive(text: string): boolean {
  const t = text.toLowerCase();
  return SENSITIVE.some((w) => t.includes(w));
}

/** 昵称：2–12，trim 后非空，至少一个汉字/字母/数字 */
export function validateNickname(raw: string): { ok: true; value: string } | { ok: false; code: string; message: string } {
  const value = raw.trim();
  if (value.length < 2 || value.length > 12) {
    return { ok: false, code: '40001', message: '昵称需为 2–12 个字符' };
  }
  if (!/[\u4e00-\u9fa5a-zA-Z0-9]/.test(value)) {
    return { ok: false, code: '40001', message: '昵称不能为纯符号或纯 emoji' };
  }
  if (containsSensitive(value)) {
    return { ok: false, code: '40001', message: '昵称含敏感词' };
  }
  return { ok: true, value };
}

export function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '****';
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  }
  return `${digits.slice(0, 2)}****${digits.slice(-2)}`;
}
