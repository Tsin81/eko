import { ActionImpl } from '../../src/models/action';
import { Tool, ExecutionContext, InputSchema } from '../../src/types/action.types';
import { NodeInput, NodeOutput } from '../../src/types/workflow.types';
import { LLMProvider, Message, LLMParameters, LLMStreamHandler } from '../../src/types/llm.types';

// 模拟测试工具
class MockTool implements Tool<any, any> {
  constructor(
    public name: string,
    public description: string = '模拟测试工具',
    public shouldFail: boolean = false
  ) {}

  input_schema = {
    type: 'object',
    properties: {
      testParam: { type: 'string' },
    },
    required: ['testParam'],
  } as InputSchema;

  async execute(context: ExecutionContext, params: unknown): Promise<unknown> {
    if (this.shouldFail) {
      throw new Error('工具执行失败');
    }
    return { success: true, params };
  }
}

// 模拟 LLM 提供商
class MockLLMProvider implements LLMProvider {
  constructor(
    private toolCallResponses: Array<{ name: string; input: any }> = [],
    public shouldFail: boolean = false,
    public counter: number = 0
  ) {}

  async generateText(): Promise<any> {
    if (this.shouldFail) {
      throw new Error('LLM 生成失败');
    }
    return {
      content: '测试响应',
      toolCalls: this.toolCallResponses,
    };
  }

  async generateStream(
    messages: Message[],
    params: LLMParameters,
    handler: LLMStreamHandler
  ): Promise<void> {
    if (this.shouldFail) {
      handler.onError?.(new Error('流生成失败'));
      return;
    }

    // 模拟思考输出
    handler.onContent?.('正在思考任务...');

    // 处理每个工具调用
    const toolCall = this.toolCallResponses[this.counter++];
    handler.onToolUse?.({
      id: `tool-${Math.random()}`,
      name: toolCall.name,
      input: toolCall.input,
    });

    // 最终响应
    handler.onComplete?.({
        content: [
          { type: 'text', text: '正在思考任务...' },
          {
            type: 'tool_use',
            id: `tool-${Math.random()}`,
            name: toolCall.name,
            input: toolCall.input
          }
        ],
        toolCalls: [{
          id: `tool-${Math.random()}`,
          name: toolCall.name,
          input: toolCall.input
        }],
        stop_reason: 'tool_use',
        textContent: null  // 使用工具时无文本内容
      });
  }
}

describe('操作模板', () => {
  let mockTool: MockTool;
  let mockLLMProvider: MockLLMProvider;
  let context: ExecutionContext;

  beforeEach(() => {
    mockTool = new MockTool('test_tool');
    mockLLMProvider = new MockLLMProvider();
    context = {
      llmProvider: mockLLMProvider,
      variables: new Map<string, unknown>(),
      tools: new Map<string, Tool<any, any>>(),
    };
  });

  describe('构造函数', () => {
    it('应使用包括 write_context 在内的工具创建操作', () => {
      const action = ActionImpl.createPromptAction('test_action', '此操作用于测试', [mockTool], mockLLMProvider);

      expect(action.tools).toHaveLength(2); // Original tool + write_context
      expect(action.tools.some((t) => t.name === 'write_context')).toBeTruthy();
      expect(action.tools.some((t) => t.name === 'test_tool')).toBeTruthy();
    });
  });

  describe('执行', () => {
    it('应处理成功的工具执行', async () => {
      // 设置 LLM 以进行工具调用
      mockLLMProvider = new MockLLMProvider([
        { name: 'test_tool', input: { testParam: '测试' } },
        { name: 'return_output', input: { value: '测试返回' } },
      ]);

      const action = ActionImpl.createPromptAction('test_action', '此操作用于测试', [mockTool], mockLLMProvider);

      const nodeInput: NodeInput = { items: [] };
      nodeInput.items.push({ name: 'test_input', description: '测试输入' } as NodeOutput);
      await action.execute(nodeInput, context);
      // 工具运行成功，未出现错误
    });

    it('应处理失败的工具执行', async () => {
      // 设置失败工具
      mockTool = new MockTool('test_tool', 'Mock tool', true);
      mockLLMProvider = new MockLLMProvider([
        { name: 'test_tool', input: { testParam: '测试' } },
        { name: 'return_output', input: { value: '测试返回' } },
    ]);

      const action = ActionImpl.createPromptAction('test_action', '此操作用于测试', [mockTool], mockLLMProvider);

      const nodeInput: NodeInput = { items: [] };
      nodeInput.items.push({ name: 'test_input', description: 'Test input' } as NodeOutput);
      await action.execute(nodeInput, context);
      // 应优雅地处理工具故障，不抛出错误
    });

    it('应处理错误的LLM提供商', async () => {
      mockLLMProvider = new MockLLMProvider([], true);

      const action = ActionImpl.createPromptAction('test_action', '此操作用于测试', [mockTool], mockLLMProvider);

      const nodeInput: NodeInput = { items: [] };
      nodeInput.items.push({ name: 'test_input', description: '测试输入' } as NodeOutput)
      await expect(action.execute(nodeInput, context)).resolves.toBeDefined();
      // 应优雅地处理 LLM 故障
    });

    it('应该正确地使用 write_context 工具', async () => {
      // 设置 LLM 以进行写入上下文调用
      mockLLMProvider = new MockLLMProvider([
        {
          name: 'write_context',
          input: { key: 'test_key', value: JSON.stringify({ data: '测试' }) },
        },
        { name: 'return_output', input: { value: '测试返回' } },
      ]);

      const action = ActionImpl.createPromptAction('test_action', '此操作用于测试', [mockTool], mockLLMProvider);
      const nodeInput: NodeInput = { items: [] };
      nodeInput.items.push({ name: 'test_input', description: '测试输入' } as NodeOutput)
      await action.execute(nodeInput, context);

      // 检查是否已将值写入上下文
      expect(context.variables.get('test_key')).toEqual({ data: '测试' });
    });

    it('应处理 write_context 中的非 JSON 值', async () => {
      // 设置LLM以使用 string 值进行 write_context 调用
      mockLLMProvider = new MockLLMProvider([
        {
          name: 'write_context',
          input: { key: 'test_key', value: '纯文本值' },
        },
        { name: 'return_output', input: { value: '测试返回' } },
      ]);

      const action = ActionImpl.createPromptAction('test_action', '此操作用于测试', [mockTool], mockLLMProvider);
      const nodeInput: NodeInput = { items: [] };
      nodeInput.items.push({ name: 'test_input', description: '测试输入' } as NodeOutput)
      await action.execute(nodeInput, context);

      // 检查值是否以字符串形式写入上下文
      expect(context.variables.get('test_key')).toBe('plain text value');
    });

    it('应该在用户提示中包含上下文变量', async () => {
      // 使用一些变量设置上下文
      context.variables.set('existingVar', 'test value');

      // 创建捕获消息的模拟 LLM 提供者
      const capturedMessages: Message[] = [];
      const mockLLMProviderWithCapture = new MockLLMProvider();
      mockLLMProviderWithCapture.generateStream = async (messages, params, handler) => {
        capturedMessages.push(...messages);
        // 继续进行正常的数据流处理
        await handler.onContent?.('Test content');
      };

      const action = ActionImpl.createPromptAction(
        'test_action', '此操作用于测试',
        [mockTool],
        mockLLMProviderWithCapture
      );
      const nodeInput: NodeInput = { items: [] };
      nodeInput.items.push({ name: 'test_input', description: '测试输入' } as NodeOutput)
      await action.execute(nodeInput, context);

      // 验证系统提示是否包含上下文变量
      const initialPrompt = capturedMessages[1].content as string;
      expect(initialPrompt).toContain('existingVar');
      expect(initialPrompt).toContain('test value');
    });

    it('应合并操作工具与上下文工具', async () => {
      const contextTool = new MockTool('context_tool');
      context.tools?.set(contextTool.name, contextTool);

      mockLLMProvider = new MockLLMProvider([
        { name: 'context_tool', input: { testParam: '测试' } },
        { name: 'test_tool', input: { testParam: '测试' } },
        { name: 'return_output', input: { value: '测试返回' } },
      ]);

      const action = ActionImpl.createPromptAction('test_action', '此操作用于测试', [mockTool], mockLLMProvider);
      const nodeInput: NodeInput = { items: [] };
      nodeInput.items.push({ name: 'test_input', description: '测试输入' } as NodeOutput)
      await action.execute(nodeInput, context);
      // 这两个工具都应该是可访问的
    });
  });
});
