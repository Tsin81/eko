import { BrowserUseParam, BrowserUseResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { getWindowId, getTabId, sleep, injectScript, executeScript } from '../utils';
import * as browser from './browser';

/**
 * 通用浏览器使用
 */
export class BrowserUse implements Tool<BrowserUseParam, BrowserUseResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'browser_use';
    this.description = `使用结构化命令与浏览器交互，通过截图和网页元素提取来操作页面元素。
* 这是一个浏览器图形界面，你需要通过截图和提取页面元素结构来分析网页，并指定操作序列来完成指定任务。
* 任何操作前必须首先调用 \`screenshot_extract_element\` 命令，该命令将返回浏览器页面截图和结构化元素信息（两者均经过特殊处理）。
* 元素交互规则：
   - 仅使用元素列表中存在的索引
   - 每个元素都有唯一索引号（如 "[33]:<button>"）
   - 标有 "[]:" 的元素为不可交互元素（仅用于上下文参考）
* 导航与错误处理：
   - 若无合适元素，使用其他功能完成任务
   - 遇到操作卡顿时尝试替代方案
   - 通过接受/关闭处理弹窗和Cookie提示
   - 使用滚动操作查找目标元素`;
    this.input_schema = {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: `要执行的操作。可用的操作包括：
* \`screenshot_extract_element\`：截取网页截图并提取可操作元素。
  - 截图用于理解页面布局，标注的边界框对应元素索引。每个边界框及其标签使用相同颜色，标签通常位于框的右上角。
  - 截图帮助验证元素位置和关系。标签可能偶尔重叠，因此需结合提取的元素信息确认正确元素。
  - 除截图外，还会返回交互元素的简化信息，元素索引与截图中的索引对应。
* \`input_text\`：在交互元素中输入字符串。
* \`click\`：点击元素。
* \`right_click\`：在元素上执行右键点击。
* \`double_click\`：双击元素。
* \`scroll_to\`：滚动页面至指定元素位置。
* \`extract_content\`：提取当前网页的文本内容。
* \`get_dropdown_options\`：从原生下拉元素中获取所有选项。
* \`select_dropdown_option\`：根据选项文本为指定交互元素索引选择下拉选项。`,
          enum: [
            'screenshot_extract_element',
            'input_text',
            'click',
            'right_click',
            'double_click',
            'scroll_to',
            'extract_content',
            'get_dropdown_options',
            'select_dropdown_option',
          ],
        },
        index: {
          type: 'integer',
          description:
            '元素的索引，操作元素必须传递相应的元素索引',
        },
        text: {
          type: 'string',
          description: '为 `action=input_text` 和 `action=select_dropdown_option` 所必需',
        },
      },
      required: ['action'],
    };
  }

  /**
   * 浏览器
   *
   * @param {*} params { action: 'input_text', index: 1, text: 'string' }
   * @returns > { success: true, image?: { type: 'base64', media_type: 'image/jpeg', data: '/9j...' }, text?: string }
   */
  async execute(context: ExecutionContext, params: BrowserUseParam): Promise<BrowserUseResult> {
    try {
      if (params === null || !params.action) {
        throw new Error('参数无效。期望对象具有 “action” 属性。');
      }
      let tabId: number;
      try {
        tabId = await getTabId(context);
        if (!tabId || !Number.isInteger(tabId)) {
          throw new Error('无法获取有效的标签页 ID');
        }
      } catch (e) {
        console.error('标签页 ID 错误：', e);
        return { success: false, error: '无法访问浏览器标签页' };
      }
      let windowId = await getWindowId(context);
      let selector_map = context.selector_map;
      let selector_xpath;
      if (params.index != null && selector_map) {
        selector_xpath = selector_map[params.index]?.xpath;
        if (!selector_xpath) {
          throw new Error('元素不存在');
        }
      }
      let result;
      switch (params.action) {
        case 'input_text':
          if (params.index == null) {
            throw new Error('需要索引参数');
          }
          if (params.text == null) {
            throw new Error('需要文本参数');
          }
          await browser.clear_input_by(tabId, selector_xpath, params.index);
          result = await browser.type_by(tabId, params.text, selector_xpath, params.index);
          await sleep(200);
          break;
        case 'click':
          if (params.index == null) {
            throw new Error('需要索引参数');
          }
          result = await browser.left_click_by(tabId, selector_xpath, params.index);
          await sleep(100);
          break;
        case 'right_click':
          if (params.index == null) {
            throw new Error('需要索引参数');
          }
          result = await browser.right_click_by(tabId, selector_xpath, params.index);
          await sleep(100);
          break;
        case 'double_click':
          if (params.index == null) {
            throw new Error('需要索引参数');
          }
          result = await browser.double_click_by(tabId, selector_xpath, params.index);
          await sleep(100);
          break;
        case 'scroll_to':
          if (params.index == null) {
            throw new Error('需要索引参数');
          }
          result = await browser.scroll_to_by(tabId, selector_xpath, params.index);
          await sleep(500);
          break;
        case 'extract_content':
          let tab = await chrome.tabs.get(tabId);
          await injectScript(tabId);
          await sleep(200);
          let content = await executeScript(tabId, () => {
            return eko.extractHtmlContent();
          }, []);
          result = {
            title: tab.title,
            url: tab.url,
            content: content,
          };
          break;
        case 'get_dropdown_options':
          if (params.index == null) {
            throw new Error('需要索引参数');
          }
          result = await browser.get_dropdown_options(tabId, selector_xpath, params.index);
          break;
        case 'select_dropdown_option':
          if (params.index == null) {
            throw new Error('需要索引参数');
          }
          if (params.text == null) {
            throw new Error('需要文本参数');
          }
          result = await browser.select_dropdown_option(
            tabId,
            params.text,
            selector_xpath,
            params.index
          );
          break;
        case 'screenshot_extract_element':
          await sleep(100);
          await injectScript(tabId, 'build_dom_tree.js');
          await sleep(100);
          let element_result = await executeScript(tabId, () => {
            return (window as any).get_clickable_elements(true);
          }, []);
          context.selector_map = element_result.selector_map;
          let screenshot = await browser.screenshot(windowId, true);
          await executeScript(tabId, () => {
            return (window as any).remove_highlight();
          }, []);
          result = { image: screenshot.image, text: element_result.element_str };
          break;
        default:
          throw Error(
            `参数无效。${params.action} 值未包含在 “action” 枚举中。`
          );
      }
      if (result) {
        return { success: true, ...result };
      } else {
        return { success: false };
      }
    } catch (e: any) {
      console.error('浏览器使用出错：', e);
      return { success: false, error: e?.message };
    }
  }

  destroy(context: ExecutionContext) {
    delete context.selector_map;
  }
}
