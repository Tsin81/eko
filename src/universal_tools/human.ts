import {
  HumanInputTextInput,
  HumanInputTextResult,
  HumanInputSingleChoiceInput,
  HumanInputSingleChoiceResult,
  HumanInputMultipleChoiceInput,
  HumanInputMultipleChoiceResult,
  HumanOperateInput,
  HumanOperateResult,
} from '../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../types/action.types';

export class HumanInputText implements Tool<HumanInputTextInput, HumanInputTextResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'human_input_text';
    this.description = '当你不确定下一步行动的细节时，请调用此工具并在“question”字段中向用户询问详细信息。用户将提供文本作为答复。';
    this.input_schema = {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: '在这里询问用户。',
        },
      },
      required: ['question'],
    };
  }

  async execute(context: ExecutionContext, params: HumanInputTextInput): Promise<HumanInputTextResult> {
    if (typeof params !== 'object' || params === null || !params.question) {
      throw new Error('参数无效。期望对象具有 “question” 属性。');
    }
    const question = params.question;
    console.log("问题：" + question);
    let answer = await context.callback?.hooks.onHumanInputText?.(question);
    if (!answer) {
      console.error("无法获取用户答复。");
      return {status: "错误：无法获取用户答复。", answer: ""};
    } else {
      console.log("答复：" + answer);
      return {status: "OK", answer: answer};
    }
  }
}

export class HumanInputSingleChoice implements Tool<HumanInputSingleChoiceInput, HumanInputSingleChoiceResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'human_input_single_choice';
    this.description = '当你不确定下一步行动的细节时，请调用此工具并在“question”字段中向用户询问包含至少2个选项的详细信息。用户将提供其中一个选项作为答复。';
    this.input_schema = {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: '在这里询问用户。',
        },
        choices: {
          type: 'array',
          description: '所有选择',
        }
      },
      required: ['question', 'choices'],
    };
  }

  async execute(context: ExecutionContext, params: HumanInputSingleChoiceInput): Promise<HumanInputSingleChoiceResult> {
    if (typeof params !== 'object' || params === null || !params.question || !params.choices) {
      throw new Error('参数无效。期望对象具有 “question” 和 “choices” 属性。');
    }
    const question = params.question;
    const choices = params.choices;
    console.log("问题：" + question);
    console.log("选择：" + choices);
    let answer = await context.callback?.hooks.onHumanInputSingleChoice?.(question, choices);
    if (!answer) {
      console.error("无法获取用户答复");
      return {status: "错误：无法获取用户答复", answer: ""};
    } else {
      console.log("答复：" + answer);
      return {status: "OK", answer: answer};
    }
  }
}

export class HumanInputMultipleChoice implements Tool<HumanInputMultipleChoiceInput, HumanInputMultipleChoiceResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'human_input_multiple_choice';
    this.description = '当你不确定下一步行动的细节时，请调用此工具并在“question”字段中向用户询问包含至少2个选项的详细信息。用户将提供一个或多个选项作为答复。';
    this.input_schema = {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: '在这里询问用户。',
        },
        choices: {
          type: 'array',
          description: '所有选择。',
        }
      },
      required: ['question', 'choices'],
    };
  }

  async execute(context: ExecutionContext, params: HumanInputMultipleChoiceInput): Promise<HumanInputMultipleChoiceResult> {
    if (typeof params !== 'object' || params === null || !params.question || !params.choices) {
      throw new Error('参数无效。期望对象具有 “question” 和 "choices" 属性。');
    }
    const question = params.question;
    const choices = params.choices;
    console.log("问题：" + question);
    console.log("选择：" + choices);
    let answer = await context.callback?.hooks.onHumanInputMultipleChoice?.(question, choices);
    if (!answer) {
      console.error("无法获取用户答复。");
      return {status: "错误：无法获取用户答复。", answer: []};
    } else {
      console.log("答复：" + answer);
      return {status: "OK", answer: answer};
    }
  }
}

export class HumanOperate implements Tool<HumanOperateInput, HumanOperateResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'human_operate';
    this.description = '当你遇到需要登录、验证码验证或其他无法独立完成的操作时，请调用此工具，将控制权转移给用户并说明原因。';
    this.input_schema = {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: '你需要转移控制权的原因。',
        },
      },
      required: ['reason'],
    };
  }

  async execute(context: ExecutionContext, params: HumanOperateInput): Promise<HumanOperateResult> {
    if (typeof params !== 'object' || params === null || !params.reason) {
      throw new Error('参数无效。预期具有 “reason” 属性。');
    }
    const reason = params.reason;
    console.log("原因：" + reason);
    let userOperation = await context.callback?.hooks.onHumanOperate?.(reason);
    if (!userOperation) {
      console.error("无法获取用户操作。");
      return {status: "错误：无法获取用户操作。", userOperation: ""};
    } else {
      console.log("用户操作：" + userOperation);
      return {status: "OK", userOperation: userOperation};
    }
  }
}
