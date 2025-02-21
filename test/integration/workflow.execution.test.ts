import { Tool, ExecutionContext, InputSchema, Properties } from '../../src/types/action.types';
import { WorkflowImpl } from '../../src/models/workflow';
import { ActionImpl } from '../../src/models/action';
import { ClaudeProvider } from '../../src/services/llm/claude-provider';
import dotenv from 'dotenv';

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  throw new Error('集成测试需要 ANTHROPIC_API_KEY 环境变量');
}

// 仅在明确启用的情况下运行这些测试
const ENABLE_INTEGRATION_TESTS = process.env.ENABLE_INTEGRATION_TESTS === 'true';
const describeIntegration = ENABLE_INTEGRATION_TESTS ? describe : describe.skip;

// 添加工具
class AddTool implements Tool<any, any> {
  name = 'add';
  description = '将两个数字相加。';
  input_schema = {
    type: 'object',
    properties: {
      a: {
        type: 'number',
        description: '第一个数字'
      } as const,
      b: {
        type: 'number',
        description: '第二个数字'
      } as const
    } as unknown as Properties,
    required: ['a', 'b']
  } as InputSchema;

  async execute(context: ExecutionContext, params: unknown): Promise<unknown> {
    const { a, b } = params as { a: number; b: number };
    return { result: a + b };
  }
}

// 乘法工具
class MultiplyTool implements Tool<any, any> {
  name = 'multiply';
  description = '两个数字相乘。';
  input_schema = {
    type: 'object',
    properties: {
      a: {
        type: 'number',
        description: '第一个数字'
      } as const,
      b: {
        type: 'number',
        description: '第二个数字'
      } as const
    } as unknown as Properties,
    required: ['a', 'b']
  } as InputSchema;

  async execute(context: ExecutionContext, params: unknown): Promise<unknown> {
    const { a, b } = params as { a: number; b: number };
    return { result: a * b };
  }
}

// 用于显示结果的 Echo 工具
class EchoTool implements Tool<any, any> {
  name = 'echo';
  description = '显示/打印信息或数值。';
  input_schema = {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: '要显示的信息或数值'
      } as const
    } as unknown as Properties,
    required: ['message']
  } as InputSchema;

  async execute(context: ExecutionContext, params: unknown): Promise<unknown> {
    const { message } = params as { message: string };
    console.log('Echo:', message);
    return { displayed: message };
  }
}

describeIntegration('最小化工作流集成', () => {
  let llmProvider: ClaudeProvider;
  let context: ExecutionContext;
  let tools: Tool<any, any>[];

  beforeAll(() => {
    llmProvider = new ClaudeProvider(ANTHROPIC_API_KEY);
    tools = [new AddTool(), new MultiplyTool(), new EchoTool()];
  });

  beforeEach(() => {
  });

  it('应使用工具链计算 23 * 45 + 67', async () => {
    // 创建计算操作
    const calculateAction = ActionImpl.createPromptAction(
      '计算表达式 23 * 45 + 67',
      '计算表达式 23 * 45 + 67',
      tools,
      llmProvider,
      { maxTokens: 1000 }
    );

    // 创建显示操作
    const displayAction = ActionImpl.createPromptAction(
      '显示结果',
      '显示结果',
      tools,
      llmProvider,
      { maxTokens: 1000 }
    );

    // 创建工作流
    const workflow = new WorkflowImpl(
      'calc-and-display',
      '计算与显示工作流程',
      { workingWindowId: undefined },
    );

    workflow.llmProvider = llmProvider;

    // 添加计算节点
    const calculateNode = {
      id: 'calculate',
      name: '计算表达式',
      dependencies: [],
      input: {
        type: 'object',
        schema: {},
        value: null,
        item: []
      },
      output: {
        type: 'object',
        schema: {},
        value: null
      },
      action: calculateAction
    };
    workflow.addNode(calculateNode);

    // 添加显示节点
    workflow.addNode({
      id: 'display',
      name: '显示结果',
      dependencies: ['calculate'],
      input: {
        type: 'object',
        schema: {},
        value: null
      },
      output: {
        type: 'object',
        schema: {},
        value: null
      },
      action: displayAction
    });

    // 执行工作流
    await workflow.execute();

    // 记录所有上下文变量
    console.log('上下文变量：', Object.fromEntries(workflow.variables));

    // 在上下文变量中查找数值结果
    const numberResults = Array.from(workflow.variables.entries())
      .filter(([_, value]) => typeof value === 'number');

    expect(numberResults.length).toBeGreaterThan(0);

    // 找出最终计算结果 (1102)
    const finalResult = numberResults.find(([_, value]) => value === 1102);
    expect(finalResult).toBeDefined();
    console.log('找到结果：', finalResult);
  }, 60000);
});
