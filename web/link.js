// 从粘贴的文字里找链接，并识别常见的平台分享链接（这些是网页，不是音频文件本身）

const PLATFORMS = [
  [/(^|\.)(douyin\.com|iesdouyin\.com|tiktok\.com)$/, '抖音'],
  [/(^|\.)(bilibili\.com|b23\.tv)$/, 'B站'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)(xiaohongshu\.com|xhslink\.com)$/, '小红书'],
  [/(^|\.)(kuaishou\.com|chenzhongtech\.com)$/, '快手'],
  [/(^|\.)music\.163\.com$|(^|\.)163cn\.tv$/, '网易云音乐'],
  [/(^|\.)(y\.qq\.com|c6\.y\.qq\.com)$/, 'QQ 音乐'],
  [/(^|\.)(kugou\.com|kuwo\.cn)$/, '酷狗 / 酷我'],
  [/(^|\.)(weixin\.qq\.com)$/, '微信'],
  [/(^|\.)(music\.apple\.com|open\.spotify\.com)$/, '在线音乐平台'],
];

/** 文字里的第一个 http(s) 链接；分享文案常是“标题 + 链接” */
export function findURL(text) {
  const m = String(text).match(/https?:\/\/[^\s<>"'，。！？、）)】]+/i);
  if (!m) return null;
  try {
    return new URL(m[0]);
  } catch {
    return null;
  }
}

/** 平台分享链接返回平台名，否则 null */
export function platformOf(url) {
  const host = url.hostname.toLowerCase();
  for (const [re, name] of PLATFORMS) if (re.test(host)) return name;
  return null;
}

/** 从链接路径里取文件名（不含扩展名），取不到就用域名 */
export function nameFromURL(url) {
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
  return last.replace(/\.[^.]+$/, '') || url.hostname;
}
