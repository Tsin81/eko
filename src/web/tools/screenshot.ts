import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { screenshot } from './browser';
import { ScreenshotResult } from '../../types/tools.types';

/**
 * 当前页面截图
 */
export class Screenshot implements Tool<any, ScreenshotResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'screenshot';
    this.description = '对当前网页窗口进行截图';
    this.input_schema = {
      type: 'object',
      properties: {},
    };
  }

  /**
   * 当前页面截图
   *
   * @param {*} params {}
   * @returns > { image: { type: 'base64', media_type: 'image/png', data } }
   */
  async execute(context: ExecutionContext, params: unknown): Promise<ScreenshotResult> {
    return await screenshot();
  }
}
