import { LLMParameters, Message } from '../../types/llm.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { TaskPrompt, ElementRect } from '../../types/tools.types';
import { executeScript, getTabId, getWindowId } from '../utils';
import { extractOperableElements, getOperableElementRect } from './html_script';
import { screenshot } from './browser';

/**
 * 查找元素位置
 */
export class FindElementPosition implements Tool<TaskPrompt, ElementRect | null> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'find_element_position';
    this.description = '通过任务提示定位元素坐标';
    this.input_schema = {
      type: 'object',
      properties: {
        task_prompt: {
          type: 'string',
          description: '任务提示，例如：找到搜索输入框',
        },
      },
      required: ['task_prompt'],
    };
  }

  async execute(context: ExecutionContext, params: TaskPrompt): Promise<ElementRect | null> {
    if (typeof params !== 'object' || params === null || !params.task_prompt) {
      throw new Error('参数无效。期望对象具有 “task_prompt” 属性。');
    }
    let result: ElementRect | null;
    let task_prompt = params.task_prompt;
    try {
      result = await executeWithHtmlElement(context, task_prompt);
    } catch (e) {
      console.log(e);
      result = null;
    }
    if (!result) {
      result = await executeWithBrowserUse(context, task_prompt);
    }
    return result;
  }
}

async function executeWithHtmlElement(
  context: ExecutionContext,
  task_prompt: string
): Promise<ElementRect | null> {
  let tabId = await getTabId(context);
  let pseudoHtml = await executeScript(tabId, extractOperableElements, []);
  let messages: Message[] = [
    {
      role: 'user',
      content: `# 任务
根据用户输入确定操作意图，在网页HTML中找到需要操作的元素ID，若元素不存在则无需执行任何操作。
输出JSON格式，无需解释说明。

# 用户输入
${task_prompt}

# 输出示例（当元素存在时）
{"elementId": "1"}

# 输出示例（当元素不存在时）
{"elementId": null}

# HTML
${pseudoHtml}
`,
    },
  ];
  let llm_params: LLMParameters = { maxTokens: 1024 };
  let response = await context.llmProvider.generateText(messages, llm_params);
  let content =
    typeof response.content == 'string' ? response.content : (response.content as any[])[0].text;
  let json = content.substring(content.indexOf('{'), content.indexOf('}') + 1);
  let elementId = JSON.parse(json).elementId;
  if (elementId) {
    return await executeScript(tabId, getOperableElementRect, [elementId]);
  }
  return null;
}

async function executeWithBrowserUse(
  context: ExecutionContext,
  task_prompt: string
): Promise<ElementRect | null> {
  let tabId = await getTabId(context);
  let windowId = await getWindowId(context);
  let screenshot_result = await screenshot(windowId, false);
  let messages: Message[] = [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: screenshot_result.image,
        },
        {
          type: 'text',
          text: '找到元素：' + task_prompt,
        },
      ],
    },
  ];
  let llm_params: LLMParameters = {
    maxTokens: 1024,
    toolChoice: {
      type: 'tool',
      name: 'get_element_by_coordinate',
    },
    tools: [
      {
        name: 'get_element_by_coordinate',
        description: '根据坐标检索元素信息',
        input_schema: {
          type: 'object',
          properties: {
            coordinate: {
              type: 'array',
              description:
                '(x, y)：x（与左边缘的像素距离）与 y（与顶边缘的像素距离）的坐标。',
            },
          },
          required: ['coordinate'],
        },
      },
    ],
  };
  let response = await context.llmProvider.generateText(messages, llm_params);
  let input = response.toolCalls[0].input;
  let coordinate = input.coordinate as [number, number];

  return {
    left: coordinate[0],
    top: coordinate[1],
  } as ElementRect;
}
