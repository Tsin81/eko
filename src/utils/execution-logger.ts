import { Message } from '../types/llm.types';
import { ExecutionContext } from '../types/action.types';

interface ImageData {
  type: 'base64';
  media_type: string;
  data: string;
}

export interface LogOptions {
  maxHistoryLength?: number; // 保留在历史记录中的信息的最大数量
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  includeTimestamp?: boolean;
  debugImagePath?: string; // 保存调试图像的目录路径（仅限 Node.js）
  imageSaver?: (imageData: ImageData, filename: string) => Promise<string>; // 自定义图像保存功能
}

/**
 * 管理行动执行日志，提供更清晰的执行流程视图，
 * 同时保留重要的上下文和历史记录。
 */
export class ExecutionLogger {
  private history: Message[] = [];
  private readonly maxHistoryLength: number;
  private readonly logLevel: string;
  private readonly includeTimestamp: boolean;
  private readonly debugImagePath?: string;
  private readonly imageSaver?: (imageData: ImageData, filename: string) => Promise<string>;
  private readonly isNode: boolean;

  constructor(options: LogOptions = {}) {
    this.maxHistoryLength = options.maxHistoryLength || 10;
    this.logLevel = options.logLevel || 'info';
    this.includeTimestamp = options.includeTimestamp ?? true;
    this.debugImagePath = options.debugImagePath;
    this.imageSaver = options.imageSaver;

    // 检查是否在 Node.js 环境中运行
    this.isNode =
      typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
  }

  /**
   * 记录带有执行上下文的信息
   */
  log(level: string, message: string, context?: ExecutionContext) {
    if (this.shouldLog(level)) {
      const timestamp = this.includeTimestamp ? new Date().toISOString() : '';
      const contextSummary = this.summarizeContext(context);
      console.log(`${timestamp} [${level.toUpperCase()}] ${message}${contextSummary}`);
    }
  }

  /**
   * 更新对话历史记录，同时保持大小限制
   */
  updateHistory(messages: Message[]) {
    // 保留系统信息和最近 N 条信息
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const recentMessages = nonSystemMessages.slice(-this.maxHistoryLength);
    this.history = [...systemMessages, ...recentMessages];
  }

  /**
   * 获取当前对话历史记录
   */
  getHistory(): Message[] {
    return this.history;
  }

  /**
   * 总结日志记录的执行上下文
   */
  private summarizeContext(context?: ExecutionContext): string {
    if (!context) return '';

    const summary = {
      variables: Object.fromEntries(context.variables),
      tools: context.tools ? Array.from(context.tools.keys()) : [],
    };

    return `\n上下文：${JSON.stringify(summary, null, 2)}`;
  }

  /**
   * 根据日志级别检查是否应记录信息
   */
  private shouldLog(level: string): boolean {
    const levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    } as Record<string, number>;

    return levels[level] <= levels[this.logLevel];
  }

  /**
   * 记录操作执行的起始时间
   */
  logActionStart(actionName: string, input: unknown, context?: ExecutionContext) {
    this.log('info', `开始操作：${actionName}`, context);
    this.log('info', `输入：${JSON.stringify(input, null, 2)}`);
  }

  /**
   * 记录操作执行的完成情况
   */
  logActionComplete(actionName: string, result: unknown, context?: ExecutionContext) {
    this.log('info', `完成操作：${actionName}`, context);
    this.log('info', `结果：${JSON.stringify(result, null, 2)}`);
  }

  /**
   * 记录工具执行情况
   */
  logToolExecution(toolName: string, input: unknown, context?: ExecutionContext) {
    this.log('info', `执行工具：${toolName}`);
    this.log('info', `工具输入：${JSON.stringify(input, null, 2)}`);
  }

  /**
   * 记录执行过程中发生的错误
   */
  logError(error: Error, context?: ExecutionContext) {
    this.log('error', `发生错误： ${error.message}`, context);
    if (error.stack) {
      this.log('debug', `堆栈跟踪： ${error.stack}`);
    }
  }

  private extractFromDataUrl(dataUrl: string): { extension: string; base64Data: string } {
    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('data URL 格式无效');
    }
    return {
      extension: matches[1],
      base64Data: matches[2],
    };
  }

  private async saveDebugImage(imageData: string | ImageData, toolName: string): Promise<string> {
    try {
      let extension: string;
      let base64Data: string;

      // 同时处理 data URL 字符串和 ImageData 对象
      if (typeof imageData === 'string' && imageData.startsWith('data:')) {
        const extracted = this.extractFromDataUrl(imageData);
        extension = extracted.extension;
        base64Data = extracted.base64Data;
      } else if (typeof imageData === 'object' && 'type' in imageData) {
        extension = imageData.media_type.split('/')[1] || 'png';
        base64Data = imageData.data;
      } else {
        return '[image]';
      }

      // 如果提供了自定义图像保存程序，使用它
      if (this.imageSaver) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${toolName}_${timestamp}.${extension}`;
        return await this.imageSaver(
          { type: 'base64', media_type: `image/${extension}`, data: base64Data },
          filename
        );
      }

      // 如果在 Node.js 环境中并设置了 debugImagePath
      if (this.isNode && this.debugImagePath) {
        // 仅在需要时动态导入 Node.js 模块
        const { promises: fs } = await import('fs');
        const { join } = await import('path');

        await fs.mkdir(this.debugImagePath, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${toolName}_${timestamp}.${extension}`;
        const filepath = join(this.debugImagePath, filename);

        const buffer = Buffer.from(base64Data, 'base64');
        await fs.writeFile(filepath, buffer);

        return `[图像已保存至：${filepath}]`;
      }

      // 默认情况下 - 只返回占位符
      return '[图像]';
    } catch (error) {
      console.warn('保存调试图像失败：', error);
      return '[图像]';
    }
  }

  private async formatToolResult(result: any): Promise<string> {
    // 处理 空值/未定义
    if (result == null) {
      return 'null';
    }

    // 直接处理图像结果
    if (result.image) {
      const imagePlaceholder = await this.saveDebugImage(result.image, 'tool');
      const modifiedResult = { ...result, image: imagePlaceholder };
      return JSON.stringify(modifiedResult);
    }

    // 处理结果对象中的嵌套图像
    if (typeof result === 'object') {
      const formatted = { ...result };
      for (const [key, value] of Object.entries(formatted)) {
        if (value && typeof value === 'string' && value.startsWith('data:image/')) {
          formatted[key] = await this.saveDebugImage(value, key);
        } else if (
          value &&
          typeof value === 'object' &&
          'type' in value &&
          value.type === 'base64'
        ) {
          formatted[key] = await this.saveDebugImage(value as ImageData, key);
        }
      }
      return JSON.stringify(formatted);
    }

    // 处理原始值
    return String(result);
  }

  async logToolResult(
    toolName: string,
    result: unknown,
    context?: ExecutionContext
  ): Promise<void> {
    if (this.shouldLog('info')) {
      const timestamp = this.includeTimestamp ? new Date().toISOString() : '';
      const contextSummary = this.summarizeContext(context);
      const formattedResult = await this.formatToolResult(result);

      console.log(
        `${timestamp} [INFO] 工具已执行： ${toolName}\n` +
          `${timestamp} [INFO] 工具结果： ${formattedResult}${contextSummary}`
      );
    }
  }
}
