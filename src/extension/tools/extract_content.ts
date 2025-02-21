import { ExtractContentResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { getTabId, executeScript, injectScript, sleep } from '../utils';

/**
 * 提取页面内容
 */
export class ExtractContent implements Tool<any, ExtractContentResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'extract_content';
    this.description = '提取当前网页的文本内容';
    this.input_schema = {
      type: 'object',
      properties: {},
    };
  }

  /**
   * 提取页面内容
   *
   * @param {*} params {}
   * @returns > { tabId, result: { title, url, content }, success: true }
   */
  async execute(context: ExecutionContext, params: any): Promise<ExtractContentResult> {
    let tabId = await getTabId(context);
    let tab = await chrome.tabs.get(tabId);
    await injectScript(tabId);
    await sleep(500);
    let content = await executeScript(tabId, () => {
      return eko.extractHtmlContent();
    }, []);
    return {
      tabId,
      result: {
        title: tab.title,
        url: tab.url,
        content: content,
      }
    } as ExtractContentResult;
  }
}
