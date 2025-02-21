import { BrowserUseParam, BrowserUseResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { chromium, Browser, Page, ElementHandle, BrowserContext } from 'playwright';
import { run_build_dom_tree } from '../script/build_dom_tree';

/**
 * 浏览器使用 => `npx playwright install`
 */
export class BrowserUse implements Tool<BrowserUseParam, BrowserUseResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  private browser: Browser | null = null;
  private browser_context: BrowserContext | null = null;
  private current_page: Page | null = null;

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
* \`open_url\`：在浏览器中打开指定的 URL，URL 为文本参数。
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
            'open_url',
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
          description: '为以下操作执行所必需：open_url, input_text, select_dropdown_option',
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
      let page = this.current_page as Page;
      let selector_map = context.selector_map;
      let selector_xpath;
      if (params.index != null && selector_map) {
        selector_xpath = selector_map[params.index]?.xpath;
        if (!selector_xpath) {
          throw new Error('元素不存在');
        }
      }
      let result;
      let elementHandle: ElementHandle | null;
      switch (params.action) {
        case 'open_url':
          if (!params.text) {
            throw new Error('需要文本（url）参数');
          }
          page = await this.open_url(context, params.text);
          result = {
            title: await page.title(),
            url: page.url(),
            success: true,
          };
          break;
        case 'input_text':
          if (params.index == null) {
            throw new Error('需要索引参数');
          }
          if (params.text == null) {
            throw new Error('需要文本参数');
          }
          elementHandle = await this.get_highlight_element(page, params.index, true);
          if (elementHandle) {
            try {
              await elementHandle.fill('');
              await elementHandle.fill(params.text as string);
              result = true;
            } catch (e) {
              result = await page.evaluate(do_input, { text: params.text, index: params.index });
            }
          } else {
            result = false;
          }
          await sleep(200);
          break;
        case 'click':
          if (params.index == null) {
            throw new Error('需要索引参数');
          }
          elementHandle = await this.get_highlight_element(page, params.index);
          if (elementHandle) {
            try {
              await elementHandle.click({ button: 'left', force: true });
              result = true;
            } catch (e) {
              result = await page.evaluate(do_click, { type: 'click', index: params.index });
            }
          } else {
            result = false;
          }
          await sleep(100);
          break;
        case 'right_click':
          if (params.index == null) {
            throw new Error('需要索引参数');
          }
          elementHandle = await this.get_highlight_element(page, params.index);
          if (elementHandle) {
            try {
              await elementHandle.click({ button: 'right', force: true });
              result = true;
            } catch (e) {
              result = await page.evaluate(do_click, { type: 'right_click', index: params.index });
            }
          } else {
            result = false;
          }
          await sleep(100);
          break;
        case 'double_click':
          if (params.index == null) {
            throw new Error('需要索引参数');
          }
          elementHandle = await this.get_highlight_element(page, params.index);
          if (elementHandle) {
            try {
              await elementHandle.click({ button: 'left', clickCount: 2, force: true });
              result = true;
            } catch (e) {
              result = await page.evaluate(do_click, { type: 'double_click', index: params.index });
            }
          } else {
            result = false;
          }
          await sleep(100);
          break;
        case 'scroll_to':
          if (params.index == null) {
            throw new Error('需要索引参数');
          }
          result = await page.evaluate((highlightIndex) => {
            let element = (window as any).get_highlight_element(highlightIndex);
            if (!element) {
              return false;
            }
            element.scrollIntoView({ behavior: 'smooth' });
            return true;
          }, params.index);
          await sleep(500);
          break;
        case 'extract_content':
          let content = await this.extractHtmlContent(page);
          result = {
            title: await page.title(),
            url: page.url(),
            content: content,
          };
          break;
        case 'get_dropdown_options':
          if (params.index == null) {
            throw new Error('需要索引参数');
          }
          result = await this.get_dropdown_options(page, params.index);
          break;
        case 'select_dropdown_option':
          if (params.index == null) {
            throw new Error('需要索引参数');
          }
          if (params.text == null) {
            throw new Error('需要文本参数');
          }
          result = await this.select_dropdown_option(page, params.index, params.text);
          break;
        case 'screenshot_extract_element':
          await sleep(100);
          await this.injectScript(page);
          await sleep(100);
          let element_result = await page.evaluate(() => {
            return (window as any).get_clickable_elements(true);
          });
          context.selector_map = element_result.selector_map;
          let screenshotBuffer = await page.screenshot({
            fullPage: false,
            type: 'jpeg',
            quality: 50,
          });
          let base64 = screenshotBuffer.toString('base64');
          let image = {
            type: 'base64',
            media_type: 'image/jpeg',
            data: base64,
          }
          await page.evaluate(() => {
            return (window as any).remove_highlight();
          });
          result = { image: image, text: element_result.element_str };
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
      console.log(e);
      return { success: false, error: e?.message };
    }
  }

  private async open_url(context: ExecutionContext, url: string): Promise<Page> {
    if (!this.browser) {
      this.current_page = null;
      this.browser_context = null;
      this.browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox'],
      });
    }
    if (!this.browser_context) {
      this.current_page = null;
      this.browser_context = await this.browser.newContext();
    }
    const page: Page = await this.browser_context.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 15000,
    });
    await page.waitForLoadState('load');
    this.current_page = page;
    return page;
  }

  private async injectScript(page: Page): Promise<unknown> {
    return await page.evaluate(run_build_dom_tree);
  }

  private async get_highlight_element(
    page: Page,
    highlightIndex: number,
    findInput?: boolean
  ): Promise<ElementHandle | null> {
    return await page.evaluateHandle(
      (params: any) => {
        let element = (window as any).get_highlight_element(params.highlightIndex);
        if (element && params.findInput) {
          if (
            element.tagName != 'INPUT' &&
            element.tagName != 'TEXTAREA' &&
            element.childElementCount != 0
          ) {
            element =
              element.querySelector('input') || element.querySelector('textarea') || element;
          }
        }
        return element;
      },
      { highlightIndex, findInput }
    );
  }

  private async extractHtmlContent(page: Page): Promise<string> {
    return await page.evaluate(() => {
      let element = document.body;
      let main = element.querySelector('main');
      let content = '';
      if (main) {
        let articles = main.querySelectorAll('article');
        if (articles && articles.length > 0) {
          for (let i = 0; i < articles.length; i++) {
            content += articles[i].innerText.trim() + '\n';
          }
        } else {
          content += main.innerText.trim();
        }
      } else {
        let articles = element.querySelectorAll('article');
        if (articles && articles.length > 0) {
          for (let i = 0; i < articles.length; i++) {
            content += articles[i].innerText.trim() + '\n';
          }
        }
      }
      content = content.trim();
      if (!content) {
        content = element.innerText;
      }
      return content.replace(/\n+/g, '\n').replace(/ +/g, ' ').trim();
    });
  }

  private async get_dropdown_options(page: Page, highlightIndex: number): Promise<any> {
    return await page.evaluate((highlightIndex) => {
      let select = (window as any).get_highlight_element(highlightIndex);
      if (!select) {
        return null;
      }
      return {
        options: Array.from(select.options).map((opt: any) => ({
          index: opt.index,
          text: opt.text.trim(),
          value: opt.value,
        })),
        id: select.id,
        name: select.name,
      };
    }, highlightIndex);
  }

  private async select_dropdown_option(
    page: Page,
    highlightIndex: number,
    text: string
  ): Promise<any> {
    return await page.evaluate(
      (param: any) => {
        let select = (window as any).get_highlight_element(param.highlightIndex);
        if (!select || select.tagName.toUpperCase() !== 'SELECT') {
          return { success: false, error: '选择未找到或元素类型无效' };
        }
        const option = Array.from(select.options).find(
          (opt: any) => opt.text.trim() === param.text
        ) as any;
        if (!option) {
          return {
            success: false,
            error: '选择未找到',
            availableOptions: Array.from(select.options).map((o: any) => o.text.trim()),
          };
        }
        select.value = option.value;
        select.dispatchEvent(new Event('change'));
        return {
          success: true,
          selectedValue: option.value,
          selectedText: option.text.trim(),
        };
      },
      { highlightIndex, text }
    );
  }

  destroy(context: ExecutionContext) {
    delete context.selector_map;
    if (this.browser) {
      this.browser.close();
      this.browser = null;
      this.current_page = null;
      this.browser_context = null;
    }
  }
}

function sleep(time: number): Promise<void> {
  return new Promise((resolve) => setTimeout(() => resolve(), time));
}

function do_click(param: any) {
  function simulateMouseEvent(
    eventTypes: Array<string>,
    button: 0 | 1 | 2,
    highlightIndex?: number
  ): boolean {
    let element = (window as any).get_highlight_element(highlightIndex);
    if (!element) {
      return false;
    }
    for (let i = 0; i < eventTypes.length; i++) {
      const event = new MouseEvent(eventTypes[i], {
        view: window,
        bubbles: true,
        cancelable: true,
        button, // 0 left; 2 right
      });
      let result = element.dispatchEvent(event);
      console.log('simulateMouse', element, { eventTypes, button }, result);
    }
    return true;
  }
  if (param.type == 'right_click') {
    return simulateMouseEvent(['mousedown', 'mouseup', 'contextmenu'], 2, param.index);
  } else if (param.type == 'double_click') {
    return simulateMouseEvent(
      ['mousedown', 'mouseup', 'click', 'mousedown', 'mouseup', 'click', 'dblclick'],
      0,
      param.index
    );
  } else {
    return simulateMouseEvent(['mousedown', 'mouseup', 'click'], 0, param.index);
  }
}

function do_input(params: any): boolean {
  let text = params.text as string;
  let highlightIndex = params.index as number;
  let element = (window as any).get_highlight_element(highlightIndex);
  if (!element) {
    return false;
  }
  let enter = false;
  if (text.endsWith('\\n')) {
    enter = true;
    text = text.substring(0, text.length - 2);
  } else if (text.endsWith('\n')) {
    enter = true;
    text = text.substring(0, text.length - 1);
  }
  let input: any;
  if (element.tagName == 'IFRAME') {
    let iframeDoc = element.contentDocument || element.contentWindow.document;
    input =
      iframeDoc.querySelector('textarea') ||
      iframeDoc.querySelector('*[contenteditable="true"]') ||
      iframeDoc.querySelector('input');
  } else if (
    element.tagName == 'INPUT' ||
    element.tagName == 'TEXTAREA' ||
    element.childElementCount == 0
  ) {
    input = element;
  } else {
    input =
      element.querySelector('input') ||
      element.querySelector('textarea') ||
      element.querySelector('*[contenteditable="true"]') ||
      element;
  }
  input.focus && input.focus();
  if (!text) {
    if (input.value == undefined) {
      input.textContent = '';
    } else {
      input.value = '';
    }
  } else {
    if (input.value == undefined) {
      input.textContent += text;
    } else {
      input.value += text;
    }
  }
  let result = input.dispatchEvent(new Event('input', { bubbles: true }));
  if (enter) {
    ['keydown', 'keypress', 'keyup'].forEach((eventType) => {
      const event = new KeyboardEvent(eventType, {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);
    });
  }
  console.log('type', input, result);
  return true;
}
