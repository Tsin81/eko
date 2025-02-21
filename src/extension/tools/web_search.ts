import { WebSearchParam, WebSearchResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { MsgEvent, CountDownLatch, sleep, injectScript } from '../utils';

/**
 * 网页搜索
 */
export class WebSearch implements Tool<WebSearchParam, WebSearchResult[]> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'web_search';
    this.description = '根据关键字搜索网络，并从网页返回相关的提取内容。';
    this.input_schema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词',
        },
        maxResults: {
          type: 'integer',
          description: '最大搜索结果，默认值为5',
        },
      },
      required: ['query'],
    };
  }

  /**
   * 搜索
   *
   * @param {*} params { url: 'https://www.bing.com', query: 'ai agent', maxResults: 5 }
   * @returns > [{ title, url, content }]
   */
  async execute(context: ExecutionContext, params: WebSearchParam): Promise<WebSearchResult[]> {
    if (typeof params !== 'object' || params === null || !params.query) {
      throw new Error('参数无效。期望对象具有 “query” 属性。');
    }
    let url = params.url;
    let query = params.query;
    let maxResults = params.maxResults;
    if (!url) {
      url = 'https://www.bing.com';
    }
    let taskId = new Date().getTime() + '';
    let searchs = [{ url: url as string, keyword: query as string }];
    let searchInfo = await deepSearch(context, taskId, searchs, maxResults || 5, context.ekoConfig.workingWindowId);
    let links = searchInfo.result[0]?.links || [];
    return links.filter((s: any) => s.content) as WebSearchResult[];
  }
}

const deepSearchInjects: {
  [key: string]: { filename: string; buildSearchUrl: Function };
} = {
  'bing.com': {
    filename: 'bing.js',
    buildSearchUrl: function (url: string, keyword: string) {
      return 'https://bing.com/search?q=' + encodeURI(keyword);
    },
  },
  'duckduckgo.com': {
    filename: 'duckduckgo.js',
    buildSearchUrl: function (url: string, keyword: string) {
      return 'https://duckduckgo.com/?q=' + encodeURI(keyword);
    },
  },
  'google.com': {
    filename: 'google.js',
    buildSearchUrl: function (url: string, keyword: string) {
      return 'https://www.google.com/search?q=' + encodeURI(keyword);
    },
  },
  default: {
    filename: 'bing.js',
    buildSearchUrl: function (url: string, keyword: string) {
      url = url.trim();
      let idx = url.indexOf('//');
      if (idx > -1) {
        url = url.substring(idx + 2);
      }
      idx = url.indexOf('/', 2);
      if (idx > -1) {
        url = url.substring(0, idx);
      }
      keyword = 'site:' + url + ' ' + keyword;
      return 'https://www.bing.com/search?q=' + encodeURIComponent(keyword);
    },
  },
};

function buildDeepSearchUrl(url: string, keyword: string) {
  let idx = url.indexOf('/', url.indexOf('//') + 2);
  let baseUrl = idx > -1 ? url.substring(0, idx) : url;
  let domains = Object.keys(deepSearchInjects);
  let inject = null;
  for (let j = 0; j < domains.length; j++) {
    let domain = domains[j];
    if (baseUrl == domain || baseUrl.endsWith('.' + domain) || baseUrl.endsWith('/' + domain)) {
      inject = deepSearchInjects[domain];
      break;
    }
  }
  if (!inject) {
    inject = deepSearchInjects['default'];
  }
  return {
    filename: inject.filename,
    url: inject.buildSearchUrl(url, keyword),
  };
}

// 事件
const tabsUpdateEvent = new MsgEvent();
chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
  await tabsUpdateEvent.publish({ tabId, changeInfo, tab });
});

/**
 * deep search
 *
 * @param {string} taskId task id
 * @param {array} searchs search list => [{ url: 'https://bing.com', keyword: 'ai' }]
 * @param {number} detailsMaxNum Maximum crawling quantity per search detail page
 */
async function deepSearch(
  context: ExecutionContext,
  taskId: string,
  searchs: Array<{ url: string; keyword: string }>,
  detailsMaxNum: number,
  windowId?: number,
) {
  let closeWindow = false;
  if (!windowId) {
    // 打开新窗口
    let window = await chrome.windows.create({
      type: 'normal',
      state: 'maximized',
      url: null,
    } as any as chrome.windows.CreateData);
    windowId = window.id;
    closeWindow = true;
  }
  windowId = windowId as number;
  // 抓取搜索页面的详细页面链接
  // [{ links: [{ title, url }] }]
  let detailLinkGroups = await doDetailLinkGroups(context, taskId, searchs, detailsMaxNum, windowId);
  // 抓取页面内容和评论的所有详细信息
  let searchInfo = await doPageContent(context, taskId, detailLinkGroups, windowId);
  console.log('searchInfo: ', searchInfo);
  // 关闭窗口
  closeWindow && chrome.windows.remove(windowId);
  return searchInfo;
}

/**
 * 抓取搜索页面的详细页面链接
 *
 * @param {string} taskId task id
 * @param {array} searchs search list => [{ url: 'https://bing.com', keyword: 'ai' }]
 * @param {number} detailsMaxNum Maximum crawling quantity per search detail page
 * @param {*} window
 * @returns [{ links: [{ title, url }] }]
 */
async function doDetailLinkGroups(
  context: ExecutionContext,
  taskId: string,
  searchs: Array<{ url: string; keyword: string }>,
  detailsMaxNum: number,
  windowId: number,
) {
  let detailLinkGroups = [] as Array<any>;
  let countDownLatch = new CountDownLatch(searchs.length);
  for (let i = 0; i < searchs.length; i++) {
    try {
      // 脚本名称及构建搜索 URL
      const { filename, url } = buildDeepSearchUrl(searchs[i].url, searchs[i].keyword);
      // 打开新标签页
      let tab = await chrome.tabs.create({
        url: url,
        windowId,
      });
      context.callback?.hooks?.onTabCreated?.(tab.id as number);
      let eventId = taskId + '_' + i;
      // 监控标签页状态
      tabsUpdateEvent.addListener(async function (obj: any) {
        if (obj.tabId != tab.id) {
          return;
        }
        if (obj.changeInfo.status === 'complete') {
          tabsUpdateEvent.removeListener(eventId);
          // 注入 js
          await injectScript(tab.id as number, filename);
          await sleep(1000);
          // 抓取搜索页面的详情页
          // { links: [{ title, url }] }
          let detailLinks: any = await chrome.tabs.sendMessage(tab.id as number, {
            type: 'page:getDetailLinks',
            keyword: searchs[i].keyword,
          });
          if (!detailLinks || !detailLinks.links) {
            // TODO 出错
            detailLinks = { links: [] };
          }
          console.log('详细链接：', detailLinks);
          let links = detailLinks.links.slice(0, detailsMaxNum);
          detailLinkGroups.push({ url, links, filename });
          countDownLatch.countDown();
          chrome.tabs.remove(tab.id as number);
        } else if (obj.changeInfo.status === 'unloaded') {
          countDownLatch.countDown();
          chrome.tabs.remove(tab.id as number);
          tabsUpdateEvent.removeListener(eventId);
        }
      }, eventId);
    } catch (e) {
      console.error(e);
      countDownLatch.countDown();
    }
  }
  await countDownLatch.await(30_000);
  return detailLinkGroups;
}

/**
 * 页面内容
 *
 * @param {string} taskId task id
 * @param {array} detailLinkGroups details page group
 * @param {*} window
 * @returns search info
 */
async function doPageContent(
  context: ExecutionContext,
  taskId: string,
  detailLinkGroups: Array<any>,
  windowId: number,
) {
  const searchInfo: any = {
    total: 0,
    running: 0,
    succeed: 0,
    failed: 0,
    failedLinks: [],
    result: detailLinkGroups,
  };
  for (let i = 0; i < detailLinkGroups.length; i++) {
    let links = detailLinkGroups[i].links;
    searchInfo.total += links.length;
  }
  let countDownLatch = new CountDownLatch(searchInfo.total);

  for (let i = 0; i < detailLinkGroups.length; i++) {
    let filename = detailLinkGroups[i].filename;
    let links = detailLinkGroups[i].links;

    for (let j = 0; j < links.length; j++) {
      let link = links[j];
      // 打开新标签页
      let tab = await chrome.tabs.create({
        url: link.url,
        windowId,
      });
      context.callback?.hooks?.onTabCreated?.(tab.id as number);
      searchInfo.running++;
      let eventId = taskId + '_' + i + '_' + j;

      // 创建超时 promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('页面加载超时')), 10000); // 10 秒后超时
      });

      // 创建标签页监测 promise
      const monitorTabPromise = new Promise<void>(async (resolve, reject) => {
        tabsUpdateEvent.addListener(async function onTabUpdated(obj: any) {
          if (obj.tabId !== tab.id) return;

          if (obj.changeInfo.status === 'complete') {
            tabsUpdateEvent.removeListener(eventId);
            try {
              // 注入脚本并获取页面内容
              await injectScript(tab.id as number, filename);
              await sleep(1000);

              let result: any = await chrome.tabs.sendMessage(tab.id as number, {
                type: 'page:getContent',
              });

              if (!result) throw new Error('无结果');

              link.content = result.content;
              link.page_title = result.title;
              searchInfo.succeed++;
              resolve(); // 如果成功，则解决 promise
            } catch (error) {
              searchInfo.failed++;
              searchInfo.failedLinks.push(link);
              reject(error); // 发生错误时拒绝 promise
            } finally {
              searchInfo.running--;
              countDownLatch.countDown();
              chrome.tabs.remove(tab.id as number);
              tabsUpdateEvent.removeListener(eventId);
            }
          } else if (obj.changeInfo.status === 'unloaded') {
            searchInfo.running--;
            countDownLatch.countDown();
            chrome.tabs.remove(tab.id as number);
            tabsUpdateEvent.removeListener(eventId);
            reject(new Error('标签页卸载')); // 如果标签页卸载，则拒绝 promise
          }
        }, eventId);
      });

      // 使用 Promise.race 来强制超时
      try {
        await Promise.race([monitorTabPromise, timeoutPromise]);
      } catch (e) {
        console.error(`${link.title} 错误：`, e);
        searchInfo.running--;
        searchInfo.failed++;
        searchInfo.failedLinks.push(link);
        countDownLatch.countDown();
        chrome.tabs.remove(tab.id as number); // 清理失败标签页
      }
    }
  }

  await countDownLatch.await(60_000);
  return searchInfo;
}