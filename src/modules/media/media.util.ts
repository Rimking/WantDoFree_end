/** 媒体 kind / MIME / 归属 工具 */

export const MEDIA_OWNER_TYPES = [
  'entry',
  'avatar',
  'journey_cover',
  'guide',
  'destination',
] as const;

export type MediaOwnerTypeValue = (typeof MEDIA_OWNER_TYPES)[number];

export const IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export const AUDIO_MIMES = new Set([
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/aac',
  'audio/x-m4a',
]);

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

export function normalizeMediaKind(
  raw: string,
): 'image' | 'audio' | null {
  const k = raw.toLowerCase();
  if (k === 'image' || k === 'photo') return 'image';
  if (k === 'audio' || k === 'voice') return 'audio';
  return null;
}

/** 配额/旧 API 用 photo|voice */
export function toQuotaKind(kind: 'image' | 'audio'): 'photo' | 'voice' {
  return kind === 'image' ? 'photo' : 'voice';
}

/** 响应兼容字段 */
export function toLegacyKind(kind: string): 'photo' | 'voice' {
  return kind === 'audio' || kind === 'voice' ? 'voice' : 'photo';
}

export function extFromMime(mime: string, kind: 'image' | 'audio'): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/aac': 'aac',
  };
  return map[mime.toLowerCase()] ?? (kind === 'image' ? 'jpg' : 'm4a');
}

export function assertMimeAllowed(kind: 'image' | 'audio', mime: string) {
  const m = mime.toLowerCase();
  if (kind === 'image' && !IMAGE_MIMES.has(m)) {
    return `不支持的图片类型: ${mime}（允许 jpeg/png/webp）`;
  }
  if (kind === 'audio' && !AUDIO_MIMES.has(m)) {
    return `不支持的音频类型: ${mime}（允许 m4a/mp3/aac）`;
  }
  return null;
}

export function assertSizeAllowed(kind: 'image' | 'audio', sizeBytes: number) {
  const max = kind === 'image' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
  if (sizeBytes > max) {
    return `文件过大，${kind === 'image' ? '图片' : '音频'}上限 ${Math.floor(max / 1024 / 1024)}MB`;
  }
  if (sizeBytes < 0) return 'sizeBytes 无效';
  return null;
}

export function datePartitionKey(mediaId: string, ext: string, now = new Date()) {
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}/${mediaId}.${ext}`;
}

export function sizeNumber(v: string | number | undefined | null): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v) || 0;
}
