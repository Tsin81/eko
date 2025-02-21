import { Tool, ExecutionContext, InputSchema, Properties } from '../../src/types/action.types';
import { WorkflowGenerator } from '../../src/services/workflow/generator';
import { ClaudeProvider } from '../../src/services/llm/claude-provider';
import { WorkflowParser } from '../../src/services/parser/workflow-parser';
import * as fs from 'fs/promises';
import * as path from 'path';
import dotenv from 'dotenv';
import { ToolRegistry } from '@/index';

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
    await new Promise((resolve) => setTimeout(resolve, 5000));
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
    await new Promise((resolve) => setTimeout(resolve, 5000));
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

describeIntegration('最小化工作流与生成功能的集成', () => {
  let llmProvider: ClaudeProvider;
  let context: ExecutionContext;
  let tools: Tool<any, any>[];

  let toolRegistry: ToolRegistry;
  let generator: WorkflowGenerator;

    // 辅助功能，将工作流 DSL 保存到文件
    async function saveWorkflowToFile(dsl: string, filename: string) {
      const testOutputDir = path.join(__dirname, '../fixtures/generated');
      await fs.mkdir(testOutputDir, { recursive: true });
      await fs.writeFile(path.join(testOutputDir, filename), dsl, 'utf-8');
    }

  beforeAll(() => {
    llmProvider = new ClaudeProvider(ANTHROPIC_API_KEY);
    tools = [new AddTool(), new MultiplyTool(), new EchoTool()];
    toolRegistry = new ToolRegistry();
    tools.forEach((tool) => toolRegistry.registerTool(tool));
    generator = new WorkflowGenerator(llmProvider, toolRegistry);
  });

  beforeEach(() => {});

  it('应使用工具链计算 23 * 45 + 67', async () => {
    const prompt =
      '使用提供的计算工具计算 23 * 45 + 67，并显示结果';

    // 生成工作流
    const workflow = await generator.generateWorkflow(prompt);

    // 转换为 DSL，以便验证和检查
    const dsl = WorkflowParser.serialize(workflow);

    // 保存 DSL 供人工检查
    await saveWorkflowToFile(dsl, 'calculator.json');

    // 执行工作流
    const workflowResult = await workflow.execute();

    // 记录最终输出
    const workflowResultJson = JSON.stringify(workflowResult, null, 2);
    console.log('工作流结果：', workflowResultJson);

    // 查找结果字符串中的子字符串 (1102)
    expect(workflowResultJson).toContain('1102');
  }, 60000);
});
