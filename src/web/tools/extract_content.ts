import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { extractHtmlContent } from './browser';

/**
 * 提取页面内容
 */
export class ExtractContent implements Tool<any, string> {
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
   * @returns > string
   */
  async execute(context: ExecutionContext, params: any): Promise<string> {
    return extractHtmlContent();
  }
}
