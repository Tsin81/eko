import { ClaudeProvider } from '../../src/services/llm/claude-provider';
import { WorkflowGenerator } from '../../src/services/workflow/generator';
import { ToolRegistry } from '../../src/core/tool-registry';
import { Tool, InputSchema } from '../../src/types/action.types';
import { ValidationResult } from '../../src/types/parser.types';
import { WorkflowParser } from '../../src/services/parser/workflow-parser';
import * as fs from 'fs/promises';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// 模拟浏览器工具基类，避免重复代码
class BrowserTool implements Tool<any, any> {
  constructor(
    public name: string,
    public description: string,
    public input_schema: InputSchema
  ) {}

  async execute(params: unknown): Promise<unknown> {
    throw new Error('未执行');
  }
}

// 创建模拟浏览器工具
function createBrowserTools(): Tool<any, any>[] {
  return [
    new BrowserTool(
      'open_url',
      '在当前浏览器标签页中打开指定的 URL',
      {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '要打开的 URL'
          }
        },
        required: ['url']
      }
    ),
    new BrowserTool(
      'find_dom_object',
      '使用 CSS 选择器查找 DOM 元素，如果找到，则返回多个元素',
      {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: '用于查找元素的 CSS 选择器'
          },
          waitForElement: {
            type: 'boolean',
            description: '是否等待元素显示'
          },
          timeout: {
            type: 'integer',
            description: '最长等待时间'
          }
        },
        required: ['selector']
      }
    ),
    new BrowserTool(
      'click_dom_object',
      '点击通过 CSS 选择器找到的 DOM 元素',
      {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: '要点击元素的 CSS 选择器'
          }
        },
        required: ['selector']
      }
    ),
    new BrowserTool(
      'input_text',
      '在表单字段中输入文本',
      {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: '输入元素的 CSS 选择器'
          },
          text: {
            type: 'string',
            description: '文本输入'
          },
          clear: {
            type: 'boolean',
            description: '是否先清除现有文本'
          }
        },
        required: ['selector', 'text']
      }
    ),
    new BrowserTool(
      'copy_dom_object_text',
      '从与选择器匹配的 DOM 元素中提取文本内容',
      {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: '要复制文本的 CSS 元素选择器'
          }
        },
        required: ['selector']
      }
    ),
    new BrowserTool(
      'save_file',
      '将内容保存到文件',
      {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: '要保存的内容'
          },
          filename: {
            type: 'string',
            description: '文件名称'
          },
          type: {
            type: 'string',
            description: '文件类型',
            enum: ['text/plain', 'text/csv', 'text/html', 'application/json']
          }
        },
        required: ['content', 'filename']
      }
    )
  ];
}

const ENABLE_INTEGRATION_TESTS = process.env.ENABLE_INTEGRATION_TESTS === 'true';
const describeIntegration = ENABLE_INTEGRATION_TESTS ? describe : describe.skip;

describeIntegration('WorkflowGenerator 集成', () => {
  let toolRegistry: ToolRegistry;
  let generator: WorkflowGenerator;

  // 辅助功能，将工作流程 DSL 保存到文件
  async function saveWorkflowToFile(dsl: string, filename: string) {
    const testOutputDir = path.join(__dirname, '../fixtures/generated');
    await fs.mkdir(testOutputDir, { recursive: true });
    await fs.writeFile(path.join(testOutputDir, filename), dsl, 'utf-8');
  }

  beforeAll(() => {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      throw new Error('集成测试需要 ANTHROPIC_API_KEY 环境变量');
    }

    // 使用浏览器工具设置注册表
    toolRegistry = new ToolRegistry();
    createBrowserTools().forEach(tool => toolRegistry.registerTool(tool));

    // 使用克劳德提供商创建生成器
    const llmProvider = new ClaudeProvider(ANTHROPIC_API_KEY);
    generator = new WorkflowGenerator(llmProvider, toolRegistry);
  });

  it('应生成寻找 Chromium 开发者的工作流程', async () => {
    const prompt = "从 Github 查找 Chromium 开发人员，收集简介，并将结果汇总为 CSV 文件";

    // 生成工作流
    const workflow = await generator.generateWorkflow(prompt);

    // 转换为 DSL，以便验证和检查
    const dsl = WorkflowParser.serialize(workflow);

    // 保存 DSL 供人工检查
    await saveWorkflowToFile(dsl, 'github_chromium_workflow.json');

    // 验证生成的工作流
    const validationResult: ValidationResult = WorkflowParser.validate(JSON.parse(dsl));

    // 记录任何验证错误（有助于调试）
    if (!validationResult.valid) {
      console.error('验证错误：', JSON.stringify(validationResult.errors, null, 2));
    }

    // 断言验证
    expect(validationResult.valid).toBe(true);
    expect(validationResult.errors).toHaveLength(0);

    // 基本结构检查
    expect(workflow.id).toBeDefined();
    expect(workflow.name).toBeDefined();
    expect(workflow.nodes).toBeDefined();
    expect(workflow.nodes.length).toBeGreaterThan(0);

    // 检查日志工作流结构
    console.log('\n生成工作流结构：');
    console.log('ID：', workflow.id);
    console.log('名称：', workflow.name);
    console.log('节点数：', workflow.nodes.length);
    console.log('节点：', workflow.nodes.map(n => ({
      id: n.id,
      name: n.name,
      dependencies: n.dependencies,
      action: {
        type: n.action.type,
        tools: n.action.tools.map(t => t.name)
      }
    })));

    // 验证工具使用情况
    const usedTools = new Set<string>();
    workflow.nodes.forEach(node => {
      node.action.tools.forEach(tool => {
        usedTools.add(tool.name);
      });
    });

    console.log('\n已使用工具：', Array.from(usedTools));

    // 该工作流预期使用的工具
    const expected_tools = new Set([
      'open_url',         // 导航至 Github
      'input_text',       // 输入搜索词
      'click_dom_object', // 互动
      'find_dom_object',  // 用于查找 profile 元素
      'copy_dom_object_text', // 用于提取 profile 数据
      'save_file',         // 保存 CSV
      'write_context'      // 用于存储上下文数据
    ]);

    // 验证工具的合理使用
    expect(usedTools.size).toBeGreaterThanOrEqual(3);
    usedTools.forEach(tool => {
      expect(expected_tools).toContain(tool);
    });

    // 验证工作流是否具有适当的节点依赖关系
    expect(workflow.validateDAG()).toBe(true);

    // 最后一个节点应使用 save_file 工具来创建 CSV
    const lastNode = workflow.nodes[workflow.nodes.length - 1];
    expect(lastNode.action.tools.some(t => t.name === 'save_file')).toBe(true);

    // 第一个节点不应有任何依赖关系
    const firstNode = workflow.nodes[0];
    expect(firstNode.dependencies.length).toBe(0);

    // 其他节点应具有相关性
    workflow.nodes.slice(1).forEach(node => {
      expect(node.dependencies.length).toBeGreaterThan(0);
    });
  }, 30000); // LLM 超时时间延长
});
