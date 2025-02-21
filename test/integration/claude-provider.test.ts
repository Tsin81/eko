import { ClaudeProvider } from '../../src/services/llm/claude-provider';
import { LLMParameters, LLMStreamHandler, Message } from '../../src/types/llm.types';
import dotenv from 'dotenv';

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
if (!ANTHROPIC_API_KEY) {
  throw new Error('集成测试需要 ANTHROPIC_API_KEY 环境变量');
}

// 仅在明确启用的情况下运行这些测试
const ENABLE_INTEGRATION_TESTS = process.env.ENABLE_INTEGRATION_TESTS === 'true';
const describeIntegration = ENABLE_INTEGRATION_TESTS ? describe : describe.skip;

// 所有测试的默认模型
const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';

describeIntegration('ClaudeProvider 集成', () => {
  let provider: ClaudeProvider;

  beforeAll(() => {
    provider = new ClaudeProvider(ANTHROPIC_API_KEY, DEFAULT_MODEL, {
      baseURL: ANTHROPIC_BASE_URL,
    });
  });

  describe('生成文本', () => {
    const params: LLMParameters = {
      temperature: 0.7,
      maxTokens: 1000,
    };
    const toolParams: LLMParameters = {
      ...params,
      tools: [
        {
          name: 'calculate',
          description: '执行计算并返回结果',
          input_schema: {
            type: 'object',
            properties: {
              expression: {
                type: 'string',
                description: '用于计算的数学表达式',
              },
            },
            required: ['expression'],
          },
        },
      ],
      toolChoice: { type: 'auto' },
    };

    test('应生成简单的文本响应', async () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: '2+2 的结果是多少？请只回答数字。',
        },
      ];

      const result = await provider.generateText(messages, params);
      expect(result.textContent).toBe('4');
      expect(result.toolCalls).toHaveLength(0);
      expect(result.stop_reason).toBe('end_turn');
    }, 30000);

    test('应使用提供的工具', async () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: '234 * 456 的结果是多少？',
        },
      ];

      const result = await provider.generateText(messages, toolParams);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe('calculate');
      expect(result.toolCalls[0].input).toHaveProperty('expression');
      expect(result.stop_reason).toBe('tool_use');
    }, 30000);

    it('应处理多轮对话', async () => {
      const user_message: Message = {
        role: 'user',
        content: '234 * 456 的结果是多少？',
      };
      const messages_1: Message[] = [user_message];
      const result_1 = await provider.generateText(messages_1, toolParams);
      const tool_use_id = result_1.toolCalls[0].id;
      const messages_2: Message[] = [
        user_message,
        {
          role: 'assistant',
          content: result_1.content,
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: tool_use_id,
              content: [{ type: 'text', text: '106704' }],
            },
          ],
        },
      ];

      const result = await provider.generateText(messages_2, toolParams);
      expect(result.textContent).toMatch(/106,?704/);
      expect(result.stop_reason).toBe('end_turn');
    }, 30000);
  });

  describe('生成内容流', () => {
    it('应为文本内容流', async () => {
      const accumulated: string[] = [];
      let isStarted = false;
      let isCompleted = false;

      const handler: LLMStreamHandler = {
        onStart: () => {
          isStarted = true;
        },
        onContent: (content) => {
          accumulated.push(content);
        },
        onComplete: () => {
          isCompleted = true;
        },
        onError: (error) => {
          throw error;
        },
      };

      const messages: Message[] = [
        {
          role: 'user',
          content: '从 1 数到 3，每个数字换一行。',
        },
      ];

      await provider.generateStream(
        messages,
        {
          temperature: 0,
          maxTokens: 100,
        },
        handler
      );

      expect(isStarted).toBe(true);
      expect(isCompleted).toBe(true);
      expect(accumulated.join('')).toMatch(/1\n2\n3/);
    }, 30000);

    it('应使用流工具', async () => {
      const toolCalls: any[] = [];
      const handler: LLMStreamHandler = {
        onToolUse: (toolCall) => {
          toolCalls.push(toolCall);
        },
      };

      const messages: Message[] = [
        {
          role: 'user',
          content: '123 + 456 的结果是多少？',
        },
      ];

      await provider.generateStream(
        messages,
        {
          temperature: 0,
          tools: [
            {
              name: 'calculate',
              description: '执行计算',
              input_schema: {
                type: 'object',
                properties: {
                  expression: { type: 'string' },
                },
                required: ['expression'],
              },
            },
          ],
          toolChoice: { type: 'auto' },
        },
        handler
      );

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].name).toBe('calculate');
      expect(toolCalls[0].input).toHaveProperty('expression');
    }, 30000);
  });
});
