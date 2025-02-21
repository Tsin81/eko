import { LLMParameters, Message } from '../../types/llm.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { executeScript, getTabId, getWindowId } from '../utils';
import { extractOperableElements, clickOperableElement } from './html_script';
import { left_click, screenshot } from './browser';
import { TaskPrompt } from '../../types/tools.types';

/**
 * 元素点击
 */
export class ElementClick implements Tool<TaskPrompt, any> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'element_click';
    this.description = '通过任务提示点击元素';
    this.input_schema = {
      type: 'object',
      properties: {
        task_prompt: {
          type: 'string',
          description: '任务提示，例如：点击搜索按钮',
        },
      },
      required: ['task_prompt'],
    };
  }

  async execute(context: ExecutionContext, params: TaskPrompt): Promise<any> {
    if (typeof params !== 'object' || params === null || !params.task_prompt) {
      throw new Error('参数无效。期望对象具有 “task_prompt” 属性。');
    }
    let result;
    let task_prompt = params.task_prompt;
    try {
      result = await executeWithHtmlElement(context, task_prompt);
    } catch (e) {
      console.log(e);
      result = false;
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
): Promise<boolean> {
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
{"elementId": "1", "operationType": "click"}

# 输出示例（当元素不存在时）
{"elementId": null, "operationType": "unknown"}

# HTML
${pseudoHtml}
`,
    },
  ];
  let llm_params: LLMParameters = { maxTokens: 1024 };
  let response = await context.llmProvider.generateText(messages, llm_params);
  let content = typeof response.content == 'string' ? response.content : (response.content as any[])[0].text;
  let json = content.substring(content.indexOf('{'), content.indexOf('}') + 1);
  let elementId = JSON.parse(json).elementId;
  if (elementId) {
    return await executeScript(tabId, clickOperableElement, [elementId]);
  }
  return false;
}

async function executeWithBrowserUse(
  context: ExecutionContext,
  task_prompt: string
): Promise<boolean> {
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
          text: 'click: ' + task_prompt,
        },
      ],
    },
  ];
  let llm_params: LLMParameters = {
    maxTokens: 1024,
    toolChoice: {
      type: 'tool',
      name: 'left_click',
    },
    tools: [
      {
        name: 'left_click',
        description: '单击元素',
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
  let click_result = await left_click(tabId, coordinate);
  return click_result;
}
