import { SummaryWorkflowInput } from '../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../types/action.types';

export class SummaryWorkflow implements Tool<SummaryWorkflowInput, any> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'summary_workflow';
    this.description = '使用有序列表概括此工作流程从开始到结束所做的工作。';
    this.input_schema = {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: '以 markdown 格式编写的摘要/总结。',
        },
      },
      required: ['summary'],
    };
  }

  async execute(context: ExecutionContext, params: SummaryWorkflowInput): Promise<any> {
    if (typeof params !== 'object' || params === null || !params.summary) {
      throw new Error('参数无效。期望对象具有 “summary” 属性。');
    }
    const summary = params.summary;
    console.log("总结：" + summary);
    await context.callback?.hooks.onSummaryWorkflow?.(summary);
    return {status: "OK"};
  }
}
