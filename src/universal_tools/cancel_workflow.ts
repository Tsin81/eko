import { CancelWorkflowInput } from '../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../types/action.types';

export class CancelWorkflow implements Tool<CancelWorkflowInput, void> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'cancel_workflow';
    this.description = '取消工作流。如果任何工具持续遇到异常，请调用此工具以取消工作流。';
    this.input_schema = {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: '为什么要取消工作流。',
        },
      },
      required: ['reason'],
    };
  }

  async execute(context: ExecutionContext, params: CancelWorkflowInput): Promise<void> {
    if (typeof params !== 'object' || params === null || !params.reason) {
      throw new Error('参数无效。期望对象具有 “reason” 属性');
    }
    const reason = params.reason;
    console.log("工作流已被取消，因为：" + reason);
    await context.workflow?.cancel();
    return;
  }
}
