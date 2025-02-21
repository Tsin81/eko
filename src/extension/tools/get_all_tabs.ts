import { BrowserTab } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { getTabId, executeScript, injectScript, sleep } from '../utils';

export class GetAllTabs implements Tool<any, BrowserTab[]> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'get_all_tabs';
    this.description = '在不打开新标签页的情况下，从当前所有标签页中获取标签页 ID、标题、url 和内容。';
    this.input_schema = {
      type: 'object',
      properties: {},
    };
  }

  async execute(context: ExecutionContext, params: any): Promise<BrowserTab[]> {
    const currentWindow = await chrome.windows.getCurrent();
    const windowId = currentWindow.id;
    const tabs = await chrome.tabs.query({ windowId });
    const tabsInfo: BrowserTab[] = [];

    for (const tab of tabs) {
      if (tab.id === undefined) {
        console.warn(`带 URL 的标签页 ID 未定义：${tab.url}`);
        continue;
      }

      await injectScript(tab.id);
      await sleep(500);
      let content = await executeScript(tab.id, () => {
        return eko.extractHtmlContent();
      }, []);

      // 使用标题作为描述，但要求可能会发生变化
      let description = tab.title? tab.title : "没有相关描述。";

      const tabInfo: BrowserTab = {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        content: content,
        description: description,
      };

      console.log("url：" + tab.url);
      console.log("标题：" + tab.title);
      console.log("描述：" + description);
      tabsInfo.push(tabInfo);
    }

    return tabsInfo;
  }
}
