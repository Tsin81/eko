import { Action, Tool, ExecutionContext, InputSchema } from '../types/action.types';
import { NodeInput, NodeOutput } from '../types/workflow.types';
import {
  LLMProvider,
  Message,
  LLMParameters,
  LLMStreamHandler,
  ToolDefinition,
  LLMResponse,
} from '../types/llm.types';
import { ExecutionLogger } from '@/utils/execution-logger';

/**
 * 允许 LLM 将值写入上下文的特殊工具
 */
class WriteContextTool implements Tool<any, any> {
  name = 'write_context';
  description =
    '将值写入全局工作流上下文。使用它来存储重要的中间结果，但仅当某条信息对于将来的参考是必不可少的，但在当前操作的最终输出规范中缺少时才使用。';
  input_schema = {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: '要在其下存储值的键',
      },
      value: {
        type: 'string',
        description: '要存储的值（如果是对象/数组，则必须使用 JSON 字符串）',
      },
    },
    required: ['key', 'value'],
  } as InputSchema;

  async execute(context: ExecutionContext, params: unknown): Promise<unknown> {
    const { key, value } = params as { key: string; value: string };
    try {
      // 尝试将值解析为 JSON 格式
      const parsedValue = JSON.parse(value);
      context.variables.set(key, parsedValue);
    } catch {
      // 如果解析失败，则存储为字符串
      context.variables.set(key, value);
    }
    return { success: true, key, value };
  }
}

function createReturnTool(
  actionName: string,
  outputDescription: string,
  outputSchema?: unknown
): Tool<any, any> {
  return {
    name: 'return_output',
    description: `返回此操作的最终输出。使用此操作返回符合所需输出 schema（如果指定）和以下描述的值：
      ${outputDescription}

      你可以选择将 'use_tool_result=true' 设置为返回之前工具调用的结果，或者显式指定 'value' 并将 'use_tool_result=false' 设置为根据您的理解返回值。尽可能重用工具结果以避免冗余。
      `,
    input_schema: {
      type: 'object',
      properties: {
        use_tool_result: {
          type: ['boolean'],
          description: `是否使用最新的工具结果作为输出。当设置为 true 时，'value' 参数将被忽略。`,
        },
        value: outputSchema || {
          // 默认接受任何 JSON 值
          type: ['string', 'number', 'boolean', 'object', 'null'],
          description:
            '输出值。只有在前一个工具结果不适合输出描述时才提供一个值。否则，该值为空。',
        },
      } as unknown,
      required: ['use_tool_result', 'value'],
    } as InputSchema,

    async execute(context: ExecutionContext, params: unknown): Promise<unknown> {
      context.variables.set(`__action_${actionName}_output`, params);
      return { success: true };
    },
  };
}

export class ActionImpl implements Action {
  private readonly maxRounds: number = 10; // 默认最大轮数
  private writeContextTool: WriteContextTool;
  private toolResults: Map<string, any> = new Map();
  private logger: ExecutionLogger = new ExecutionLogger();

  constructor(
    public type: 'prompt', // 仅支持提示类型
    public name: string,
    public description: string,
    public tools: Tool<any, any>[],
    public llmProvider: LLMProvider | undefined,
    private llmConfig?: LLMParameters,
    config?: { maxRounds?: number }
  ) {
    this.writeContextTool = new WriteContextTool();
    this.tools = [...tools, this.writeContextTool];
    if (config?.maxRounds) {
      this.maxRounds = config.maxRounds;
    }
  }

  private async executeSingleRound(
    messages: Message[],
    params: LLMParameters,
    toolMap: Map<string, Tool<any, any>>,
    context: ExecutionContext
  ): Promise<{
    response: LLMResponse | null;
    hasToolUse: boolean;
    roundMessages: Message[];
  }> {
    this.logger = context.logger;
    const roundMessages: Message[] = [];
    let hasToolUse = false;
    let response: LLMResponse | null = null;

    // 收集到 roundMessages 的缓冲区
    let assistantTextMessage = '';
    let toolUseMessage: Message | null = null;
    let toolResultMessage: Message | null = null;

    // 追踪工具执行 promise
    let toolExecutionPromise: Promise<void> | null = null;

    // 监听终止信号
    if (context.signal) {
      context.signal.addEventListener('abort', () => {
        context.__abort = true;
      });
    }

    const handler: LLMStreamHandler = {
      onContent: (content) => {
        if (content.trim()) {
          assistantTextMessage += content;
        }
      },
      onToolUse: async (toolCall) => {
        this.logger.log('info', `助手：${assistantTextMessage}`);
        this.logger.logToolExecution(toolCall.name, toolCall.input, context);
        hasToolUse = true;

        const tool = toolMap.get(toolCall.name);
        if (!tool) {
          throw new Error(`工具未找到：${toolCall.name}`);
        }

        toolUseMessage = {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: toolCall.id,
              name: tool.name,
              input: toolCall.input,
            },
          ],
        };

        // 存储工具执行 promise
        toolExecutionPromise = (async () => {
          try {
            // 使用工具前
            context.__skip = false;
            if (context.callback && context.callback.hooks.beforeToolUse) {
              let modified_input = await context.callback.hooks.beforeToolUse(
                tool,
                context,
                toolCall.input
              );
              if (modified_input) {
                toolCall.input = modified_input;
              }
            }
            if (context.__skip || context.__abort || context.signal?.aborted) {
              toolResultMessage = {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: toolCall.id,
                    content: '跳过',
                  },
                ],
              };
              return;
            }
            // 执行工具
            let result = await tool.execute(context, toolCall.input);
            // 使用工具后
            if (context.callback && context.callback.hooks.afterToolUse) {
              let modified_result = await context.callback.hooks.afterToolUse(
                tool,
                context,
                result
              );
              if (modified_result) {
                result = modified_result;
              }
            }

            const result_has_image: boolean = result && result.image;
            const resultContent =
              result_has_image
                ? {
                    type: 'tool_result',
                    tool_use_id: toolCall.id,
                    content: result.text
                      ? [
                          { type: 'image', source: result.image },
                          { type: 'text', text: result.text },
                        ]
                      : [{ type: 'image', source: result.image }],
                  }
                : {
                    type: 'tool_result',
                    tool_use_id: toolCall.id,
                    content: [{ type: 'text', text: JSON.stringify(result) }],
                  };
            const resultContentText =
              result_has_image
                ? result.text
                  ? result.text + ' [Image]'
                  : '[Image]'
                : JSON.stringify(result);
            const resultMessage: Message = {
              role: 'user',
              content: [resultContent],
            };
            toolResultMessage = resultMessage;
            this.logger.logToolResult(tool.name, result, context);
            // 存储除 return_output 工具之外的工具结果
            if (tool.name !== 'return_output') {
              this.toolResults.set(toolCall.id, resultContentText);
            }
          } catch (err) {
            console.log("调用工具时发生错误：");
            console.log(err);
            const errorMessage = err instanceof Error ? err.message : '发生未知错误';
            const errorResult: Message = {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: toolCall.id,
                  content: [{ type: 'text', text: `错误：${errorMessage}` }],
                  is_error: true,
                },
              ],
            };
            toolResultMessage = errorResult;
            this.logger.logError(err as Error, context);
          }
        })();
      },
      onComplete: (llmResponse) => {
        response = llmResponse;
      },
      onError: (error) => {
        console.error('流错误：', error);
        console.log('向 LLM 发送最后一个信息阵列：', JSON.stringify(messages, null, 2));
      },
    };

    this.handleHistoryImageMessages(messages);

    // 等待信息流完成
    if (!this.llmProvider) {
      throw new Error('未设置 LLM 提供商');
    }
    await this.llmProvider.generateStream(messages, params, handler);

    // 如果工具已启动，则等待工具执行完毕
    if (toolExecutionPromise) {
      await toolExecutionPromise;
    }

    if (context.__abort) {
      throw new Error('Abort');
    }

    // 一切完成后，按正确顺序添加信息
    if (assistantTextMessage) {
      roundMessages.push({ role: 'assistant', content: assistantTextMessage });
    }
    if (toolUseMessage) {
      roundMessages.push(toolUseMessage);
    }
    if (toolResultMessage) {
      roundMessages.push(toolResultMessage);
    }

    return { response, hasToolUse, roundMessages };
  }

  private handleHistoryImageMessages(messages: Message[]) {
    // 从历史工具结果中删除所有图像，最新用户信息除外
    const initialImageCount = this.countImages(messages);

    let foundFirstUser = false;

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role === 'user') {
        if (!foundFirstUser) {
          foundFirstUser = true;
          continue;
        }

        if (Array.isArray(message.content)) {
          // 直接修改信息内容数组
          message.content = message.content.map((item: any) => {
            if (item.type === 'tool_result' && Array.isArray(item.content)) {
              // 创建不含图像的新内容数组
              if (item.content.length > 0) {
                item.content = item.content.filter((c: any) => c.type !== 'image');
                // 如果所有内容都是图像并被过滤掉，则用 “ok” 信息代替
                if (item.content.length === 0) {
                  item.content = [{ type: 'text', text: 'ok' }];
                }
              }
            }
            return item;
          });
        }
      }
    }

    const finalImageCount = this.countImages(messages);
    if (initialImageCount !== finalImageCount) {
      this.logger.log("info", `已从历史记录删除 ${initialImageCount - finalImageCount} 张图像`);
    }
  }

  private countImages(messages: Message[]): number {
    let count = 0;
    messages.forEach(msg => {
      if (Array.isArray(msg.content)) {
        msg.content.forEach((item: any) => {
          if (item.type === 'tool_result' && Array.isArray(item.content)) {
            count += item.content.filter((c: any) => c.type === 'image').length;
          }
        });
      }
    });
    return count;
  }

  async execute(
    input: NodeInput,
    output: NodeOutput,
    context: ExecutionContext,
    outputSchema?: unknown
  ): Promise<unknown> {
    this.logger = context.logger;
    console.log(`开始执行操作：${this.name}`);
    // 创建带有输出 schema 的返回工具
    const returnTool = createReturnTool(this.name, output.description, outputSchema);

    // 创建工具地图，将上下文工具、操作工具和返回工具结合起来
    const toolMap = new Map<string, Tool<any, any>>();
    this.tools.forEach((tool) => toolMap.set(tool.name, tool));
    context.tools?.forEach((tool) => toolMap.set(tool.name, tool));
    toolMap.set(returnTool.name, returnTool);

    // 准备初始信息
    const messages: Message[] = [
      { role: 'system', content: this.formatSystemPrompt() },
      { role: 'user', content: this.formatUserPrompt(context, input) },
    ];

    this.logger.logActionStart(this.name, input, context);

    // 配置工具参数
    const params: LLMParameters = {
      ...this.llmConfig,
      tools: Array.from(toolMap.values()).map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema,
      })) as ToolDefinition[],
    };

    let roundCount = 0;
    let lastResponse: LLMResponse | null = null;

    while (roundCount < this.maxRounds) {
      // 检查终止信号
      if (context.signal?.aborted) {
        throw new Error('取消工作流程');
      }

      roundCount++;
      this.logger.log('info', `开始第 ${roundCount}/${this.maxRounds} 轮次`, context);

      const { response, hasToolUse, roundMessages } = await this.executeSingleRound(
        messages,
        params,
        toolMap,
        context
      );

      if (response?.textContent) {
        context.callback?.hooks?.onLlmMessage?.(response.textContent);
      }

      lastResponse = response;

      // 将轮次信息添加到对话历史记录
      messages.push(...roundMessages);
      this.logger.log(
        'debug',
        `第 ${roundCount} 轮次信息：${JSON.stringify(roundMessages)}`,
        context
      );

      // Check termination conditions
      if (!hasToolUse && response) {
        // LLM sent a message without using tools - request explicit return
        this.logger.log('info', `助手：${response.textContent}`);
        this.logger.log('warn', 'LLM 发送了一条未使用工具的消息；要求显示返回');
        const returnOnlyParams = {
          ...params,
          tools: [
            {
              name: returnTool.name,
              description: returnTool.description,
              input_schema: returnTool.input_schema,
            },
          ],
        } as LLMParameters;

        messages.push({
          role: 'user',
          content:
            '请使用 return_output 工具处理上述信息并返回最终结果。',
        });

        const { roundMessages: finalRoundMessages } = await this.executeSingleRound(
          messages,
          returnOnlyParams,
          new Map([[returnTool.name, returnTool]]),
          context
        );
        messages.push(...finalRoundMessages);
        break;
      }

      if (response?.toolCalls.some((call) => call.name === 'return_output')) {
        break;
      }

      // 如果这是最后一轮，则强制显式返回
      if (roundCount === this.maxRounds) {
        this.logger.log('warn', '达到最大轮数，要求显示返回');
        const returnOnlyParams = {
          ...params,
          tools: [
            {
              name: returnTool.name,
              description: returnTool.description,
              input_schema: returnTool.input_schema,
            },
          ],
        } as LLMParameters;

        messages.push({
          role: 'user',
          content:
            '达到最大步数。请使用 return_output 工具尽可能返回最佳结果。',
        });

        const { roundMessages: finalRoundMessages } = await this.executeSingleRound(
          messages,
          returnOnlyParams,
          new Map([[returnTool.name, returnTool]]),
          context
        );
        messages.push(...finalRoundMessages);
      }
    }

    // 获取并清除输出值
    const outputKey = `__action_${this.name}_output`;
    const outputParams = context.variables.get(outputKey) as any;
    context.variables.delete(outputKey);

    // 获取输出值，首先检查 use_tool_result
    const outputValue = outputParams.use_tool_result
      ? Array.from(this.toolResults.values()).pop()
      : outputParams?.value;

    if (outputValue === undefined) {
      console.warn('操作已完成，但未返回值');
      return {};
    }

    return outputValue;
  }

  private formatSystemPrompt(): string {
    return `你是一个子任务执行者。你需要完成用户指定的子任务，该子任务是整体任务的组成部分。通过调用提供的工具来协助用户完成任务。

    需注意以下事项：
    1. 在需要时使用工具以完成任务
    2. 逐步思考需要完成的具体步骤
    3. 任务完成后使用 return_output 工具返回子任务输出（建议优先使用 tool_use_id 参数引用工具调用结果，而非直接提供长文本内容作为值）
    4. 使用上下文(context)存储重要信息以供后续参考，但需谨慎使用：多数情况下，子任务的输出结果应足以支持后续步骤
    5. 如果在任务执行过程中有任何不明确之处，请使用与人工相关的工具（the human-related tool）向用户询问
    6. 若任务执行过程中需要人工介入，请使用与人工相关的工具（the human-related tool）将操作权限转交给用户
    `;
  }

  private formatUserPrompt(context: ExecutionContext, input: unknown): string {
    const workflowDescription = context.workflow?.description || null;
    const actionDescription = `${this.name} -- ${this.description}`;
    const inputDescription = JSON.stringify(input, null, 2) || null;
    const contextVariables = Array.from(context.variables.entries())
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n');

    return `你正在执行工作流程中的一个子任务。工作流程的描述如下：
    ${workflowDescription}

    子任务描述如下：
    ${actionDescription}

    子任务的输入如下：
    ${inputDescription}

    上下文中存储了一些变量，可以用来参考：
    ${contextVariables}
    `;
  }

  // 静态工厂方法
  static createPromptAction(
    name: string,
    description: string,
    tools: Tool<any, any>[],
    llmProvider: LLMProvider | undefined,
    llmConfig?: LLMParameters
  ): Action {
    return new ActionImpl('prompt', name, description, tools, llmProvider, llmConfig);
  }
}
