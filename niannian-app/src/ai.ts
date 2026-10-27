import Anthropic from '@anthropic-ai/sdk';
import { CHAT_SYSTEM, ORGANIZE_SYSTEM, type Library, type Person, personContext } from './core/model';

const MODEL = 'claude-opus-5-5';

function client(apiKey: string) {
  // Key 是用户自己填的、只存在这台手机上，所以允许在客户端直接调用
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

/** 把 SDK 的错误转成给用户看的话 */
export function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return 'API Key 不对，去“我的 → AI 设置”里检查一下。';
  if (error instanceof Anthropic.PermissionDeniedError) return '这个 API Key 没有权限使用这个模型。';
  if (error instanceof Anthropic.RateLimitError) return '请求太频繁了，稍等一会儿再试。';
  if (error instanceof Anthropic.APIConnectionError) return '连不上网络，检查一下网络再试。';
  if (error instanceof Anthropic.APIError) return `服务暂时出错了（${error.status ?? '未知'}），稍后再试。`;
  return '出了点问题，稍后再试。';
}

const REFUSED = '这个问题团团没法回答，换个问法试试吧。';

/** 和团团聊某个人。history 是之前的对话，最后一条是这次的问题 */
export async function chat(apiKey: string, person: Person, lib: Library, history: Anthropic.MessageParam[]): Promise<string> {
  const response = await client(apiKey).beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // 遇到安全策略拒答时，由服务端自动换一个模型重试
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: `${CHAT_SYSTEM}\n\n以下是关于这个人的资料：\n${personContext(person, lib)}`,
    messages: history,
  });
  if (response.stop_reason === 'refusal') return REFUSED;
  const text = response.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  return text || REFUSED;
}

/** AI 整理一段小事：起标题、理顺文字 */
export async function organize(apiKey: string, text: string, person?: Person): Promise<{ title: string; text: string }> {
  const response = await client(apiKey).beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '不超过 12 个字的标题' },
            text: { type: 'string', description: '整理后的正文' },
          },
          required: ['title', 'text'],
          additionalProperties: false,
        },
      },
    },
    system: ORGANIZE_SYSTEM,
    messages: [{ role: 'user', content: `${person ? `这段记录是关于${person.name}的。\n` : ''}原文：${text}` }],
  });
  if (response.stop_reason === 'refusal') throw new Error('refused');
  const json = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const parsed = JSON.parse(json) as { title?: unknown; text?: unknown };
  return {
    title: typeof parsed.title === 'string' ? parsed.title : '',
    text: typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text : text,
  };
}
