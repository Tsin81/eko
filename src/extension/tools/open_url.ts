import { OpenUrlParam, OpenUrlResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { getWindowId, open_new_tab } from '../utils';

/**
 * 打开 Url
 */
export class OpenUrl implements Tool<OpenUrlParam, OpenUrlResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'open_url';
    this.description = '在浏览器窗口中打开指定的 URL 链接';
    this.input_schema = {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL 链接地址',
        },
        newWindow: {
          type: 'boolean',
          description: 'true：在新窗口中打开；false：在当前窗口中打开。',
        },
      },
      required: ['url'],
    };
  }

  /**
   * 打开 Url
   *
   * @param {*} params { url: 'https://www.google.com', newWindow: true }
   * @returns > { tabId, windowId, title, success: true }
   */
  async execute(context: ExecutionContext, params: OpenUrlParam): Promise<OpenUrlResult> {
    if (typeof params !== 'object' || params === null || !params.url) {
      throw new Error('参数无效。期望对象具有 “url” 属性。');
    }
    let url = params.url;
    let newWindow = params.newWindow;
    if (context.ekoConfig.workingWindowId) {
      newWindow = false;
    } else if (!newWindow && !context.variables.get('windowId') && !context.variables.get('tabId')) {
      // 首次强制打开新窗口
      newWindow = true;
    }
    let tab: chrome.tabs.Tab;
    if (newWindow) {
      tab = await open_new_tab(url, true);
      context.callback?.hooks?.onTabCreated?.(tab.id as number);
    } else {
      let windowId = context.ekoConfig.workingWindowId ? context.ekoConfig.workingWindowId : await getWindowId(context);
      tab = await open_new_tab(url, false, windowId);
      context.callback?.hooks?.onTabCreated?.(tab.id as number);
    }
    let windowId = tab.windowId as number;
    let tabId = tab.id as number;
    context.variables.set('windowId', windowId);
    context.variables.set('tabId', tabId);
    if (newWindow) {
      let windowIds = context.variables.get('windowIds') as Array<number>;
      if (windowIds) {
        windowIds.push(windowId);
      } else {
        context.variables.set('windowIds', [windowId] as Array<number>);
      }
    }
    return {
      tabId,
      windowId,
      title: tab.title,
    };
  }
}
