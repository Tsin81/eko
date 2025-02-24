<h1 align="center">
  <a href="https://github.com/Tsin81/eko" target="_blank">
    <img src="https://github.com/user-attachments/assets/55dbdd6c-2b08-4e5f-a841-8fea7c2a0b92" alt="eko-logo" width="200" height="200">
  </a>
  <br>
  <small>Eko - 使用自然语言构建可用于生产的代理工作流</small>
</h1>

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://example.com/build-status) [![Version](https://img.shields.io/github/package-json/v/FellouAI/eko?color=yellow)](https://eko.fellou.ai/docs/release/versions/)

Eko（发音类似于 “echo” ）是一个生产就绪的 JavaScript 框架，它使开发者能够创建可靠的代理，**从简单的命令到复杂的工作流**。它提供了一个统一的接口，在**计算机和浏览器环境**中运行代理。

# 框架对比


| 特点                       | Eko        | Langchain | Browser-use | Dify.ai | Coze   |
| -------------------------- | ---------- | --------- | ----------- | ------- | ------ |
| **支持平台**               | **全平台** | 服务器端  | 浏览器端    | Web     | Web    |
| **从一句话到多步骤工作流** | ✅         | ❌        | ✅          | ❌      | ❌     |
| **可干预性**               | ✅         | ✅        | ❌          | ❌      | ❌     |
| **开发效率**               | **High**   | Low       | Middle      | Middle  | Low    |
| **任务复杂度**             | **High**   | High      | Low         | Middle  | Middle |
| **开放源代码**             | ✅         | ✅        | ✅          | ✅      | ❌     |
| **访问私有网络资源**       | ✅         | ❌        | ❌          | ❌      | ❌     |

## 快速入门

```bash
npm install @eko-ai/eko
```

> 重要提示： 以下示例代码不能直接执行。请参阅 [Eko 快速入门指南](https://eko.fellou.ai/docs/getting-started/quickstart/) 指南，了解如何运行它。

```typescript
import { Eko } from '@eko-ai/eko';

const eko = new Eko({
  apiKey: 'your_anthropic_api_key',
});

// 示例： 浏览器自动化
const extWorkflow = await eko.generate("在 Bing 上搜索 “Eko 框架 ”并保存第一个结果");
await eko.execute(extWorkflow);

// 示例： 系统操作
const sysWorkflow = await eko.generate("创建名为 “报告” 的新文件夹，并将所有 PDF 文件移至此处");
await eko.execute(sysWorkflow);

```

## 演示

**提示：** `在雅虎财经上收集纳斯达克的最新数据，包括主要股票的价格变化、市值和交易量，分析数据并生成可视化报告。`.

https://github.com/user-attachments/assets/4087b370-8eb8-4346-a549-c4ce4d1efec3

单击 [这里](https://github.com/FellouAI/eko-demos/tree/main/browser-extension-stock) 获取相关源代码。

---

**提示：** `根据 github 上 Tsin81/eko 的 README，搜索竞争对手，突出 Eko 的主要贡献，撰写一篇宣传 Eko 的博文，并发布在 Write.as 上。`

https://github.com/user-attachments/assets/6feaea86-2fb9-4e5c-b510-479c2473d810

单击 [这里](https://github.com/FellouAI/eko-demos/tree/main/browser-extension-blog) 获取相关源代码。

---

**提示：** `清理当前目录下大于 1MB 的所有文件`

https://github.com/user-attachments/assets/ef7feb58-3ddd-4296-a1de-bb8b6c66e48b

单击 [这里](https://eko.fellou.ai/docs/computeruse/computer-node/#example-file-cleanup-workflow) 获取更多。

---

**提示：** 自动化软件测试

```
    当前登录页面自动化测试：
    1. 正确的账户和密码是：admin / 666666
    2. 请随机组合用户名和密码进行测试，以验证登录验证是否正常工作，例如：用户名不能为空、密码不能为空、用户名不正确、密码不正确
    3. 最后，尝试使用正确的账户和密码登录，以验证是否登录成功
    4. 生成测试报告并导出
```

https://github.com/user-attachments/assets/7716300a-c51d-41f1-8d4f-e3f593c1b6d5

单击 [这里](https://eko.fellou.ai/docs/browseruse/browser-web#example-login-automation-testing) 获取更多。

## 应用案例

- 浏览器自动化和网络刮削
- 系统文件和进程管理
- 工作流自动化
- 数据处理和整理
- GUI 自动化
- 多步任务调度

## 文档

请访问我们的 [文档网站］(https://eko.fellou.ai/docs)：

- 入门指南
- API 参考
- 使用示例
- 最佳实践
- 配置方案

## 开发环境

Eko 可在多种环境中使用：

- 浏览器插件
- 网页应用
- Node.js 应用程序

## 社区与支持

- 在 [GitHub Issues](https://github.com/FellouAI/eko/issues) 上报告问题
- 加入[松弛社区讨论](https://join.slack.com/t/eko-ai/shared_invite/zt-2xhvkudv9-nHvD1g8Smp227sM51x_Meg)
- 贡献工具和改进
- 分享使用案例和反馈

<h1 align="center">
  <a href="https://github.com/FellouAI/eko" target="_blank">
    <img width="663" alt="Screenshot 2025-02-05 at 10 49 58" src="https://github.com/user-attachments/assets/02df5b97-41c0-423f-84d8-2fee2364c36b" />
  </a>
</h1>

[![Star 历史图](https://api.star-history.com/svg?repos=FellouAI/eko&type=Date)](https://star-history.com/#FellouAI/eko&Date)

## 许可

Eko 采用 MIT 许可发布。详情请参见 [LICENSE](LICENSE) 文件。
