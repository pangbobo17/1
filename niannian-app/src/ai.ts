import { CHAT_SYSTEM, ORGANIZE_SYSTEM, type Library, type Person, personContext } from './core/model';

// 直接用 fetch 调 Messages API：官方 TypeScript SDK 在 Expo Go 的运行环境里加载会报错
const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-5-5';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ApiResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
}

/** 调用失败时抛出，带上 HTTP 状态码（网络错误为 0） */
export class AiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function createMessage(apiKey: string, body: Record<string, unknown>): Promise<ApiResponse> {
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2026-10-21',
        // 遇到安全策略拒答时，由服务端自动换一个模型重试
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 16000, fallbacks: 'default', ...body }),
    });
  } catch {
    throw new AiError(0, 'network');
  }
  if (!res.ok) {
    let message = '';
    try {
      message = ((await res.json()) as { error?: { message?: string } }).error?.message ?? '';
    } catch {}
    throw new AiError(res.status, message);
  }
  return (await res.json()) as ApiResponse;
}

function textOf(response: ApiResponse): string {
  return (response.content ?? [])
    .map((b) => (b.type === 'text' ? b.text ?? '' : ''))
    .join('')
    .trim();
}

/** 把错误转成给用户看的话 */
export function describeError(error: unknown): string {
  if (error instanceof AiError) {
    if (error.message === 'refused') return '这段内容没法整理，可以自己改一改。';
    if (error.status === 0) return '连不上网络，检查一下网络再试。';
    if (error.status === 401) return 'API Key 不对，去“我的 → AI 设置”里检查一下。';
    if (error.status === 403) return '这个 API Key 没有权限使用这个模型。';
    if (error.status === 429) return '请求太频繁了，稍等一会儿再试。';
    if (error.status === 400) return `请求有问题：${error.message || '未知原因'}`;
    return `服务暂时出错了（${error.status}），稍后再试。`;
  }
  return '出了点问题，稍后再试。';
}

const REFUSED = '这个问题团团没法回答，换个问法试试吧。';

/** 和团团聊某个人。history 是之前的对话，最后一条是这次的问题 */
export async function chat(apiKey: string, person: Person, lib: Library, history: ChatMessage[]): Promise<string> {
  const response = await createMessage(apiKey, {
    output_config: { effort: 'low' },
    system: `${CHAT_SYSTEM}\n\n以下是关于这个人的资料：\n${personContext(person, lib)}`,
    messages: history,
  });
  if (response.stop_reason === 'refusal') return REFUSED;
  return textOf(response) || REFUSED;
}

/** AI 整理一段小事：起标题、理顺文字 */
export async function organize(apiKey: string, text: string, person?: Person): Promise<{ title: string; text: string }> {
  const response = await createMessage(apiKey, {
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
  if (response.stop_reason === 'refusal') throw new AiError(200, 'refused');
  const parsed = JSON.parse(textOf(response)) as { title?: unknown; text?: unknown };
  return {
    title: typeof parsed.title === 'string' ? parsed.title : '',
    text: typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text : text,
  };
}
