import { ExecutionLogger, LogOptions } from "@/utils/execution-logger";
import { Workflow, WorkflowNode, NodeInput, NodeOutput, ExecutionContext, LLMProvider, WorkflowCallback } from "../types";
import { EkoConfig } from "../types/eko.types";

export class WorkflowImpl implements Workflow {
  abort?: boolean;
  private logger?: ExecutionLogger;
  abortControllers: Map<string, AbortController> = new Map<string, AbortController>();

  constructor(
    public id: string,
    public name: string,
    private ekoConfig: EkoConfig,
    public description?: string,
    public nodes: WorkflowNode[] = [],
    public variables: Map<string, unknown> = new Map(),
    public llmProvider?: LLMProvider,
    loggerOptions?: LogOptions
  ) {
    if (loggerOptions) {
      this.logger = new ExecutionLogger(loggerOptions);
    }
  }

  setLogger(logger: ExecutionLogger) {
    this.logger = logger;
  }

  async cancel(): Promise<void> {
    this.abort = true;
    for (const controller of this.abortControllers.values()) {
      controller.abort("工作流程取消");
    }
  }

  async execute(callback?: WorkflowCallback): Promise<NodeOutput[]> {
    if (!this.validateDAG()) {
      throw new Error("工作流程无效： 包含循环依赖关系");
    }
    this.abort = false;

    callback && await callback.hooks.beforeWorkflow?.(this);

    const executed = new Set<string>();
    const executing = new Set<string>();

    const executeNode = async (nodeId: string): Promise<void> => {
      if (this.abort) {
        throw new Error("终止");
      }
      if (executed.has(nodeId)) {
        return;
      }

      if (executing.has(nodeId)) {
        throw new Error(`节点检测到循环依赖关系： ${nodeId}`);
      }

      const node = this.getNode(nodeId);
      const abortController = new AbortController();
      this.abortControllers.set(nodeId, abortController);

      // 执行节点操作
      const context: ExecutionContext = {
        __skip: false,
        __abort: false,
        workflow: this,
        variables: this.variables,
        llmProvider: this.llmProvider as LLMProvider,
        ekoConfig: this.ekoConfig,
        tools: new Map(node.action.tools.map(tool => [tool.name, tool])),
        callback,
        logger: this.logger,
        next: () => context.__skip = true,
        abortAll: () => {
          this.abort = context.__abort = true;
          // 中止所有正在运行的任务
          for (const controller of this.abortControllers.values()) {
            controller.abort("工作流程取消");
          }
        },
        signal: abortController.signal
      };

      executing.add(nodeId);
      // 优先执行依赖项
      for (const depId of node.dependencies) {
        await executeNode(depId);
      }

      // 通过从依赖关系中收集输出来准备输入
      const input: NodeInput = { items: [] };
      for (const depId of node.dependencies) {
        const depNode = this.getNode(depId);
        input.items.push(depNode.output);
      }
      node.input = input;

      // 运行预执行钩子并执行操作
      callback && await callback.hooks.beforeSubtask?.(node, context);

      if (context.__abort) {
        throw new Error("终止");
      } else if (context.__skip) {
        return;
      }

      node.output.value = await node.action.execute(node.input, node.output, context);

      executing.delete(nodeId);
      executed.add(nodeId);

      callback && await callback.hooks.afterSubtask?.(node, context, node.output?.value);
    };

    // 执行所有终端节点（无依赖节点）
    const terminalNodes = this.nodes.filter(node =>
      !this.nodes.some(n => n.dependencies.includes(node.id))
    );

    await Promise.all(terminalNodes.map(node => executeNode(node.id)));

    callback && await callback.hooks.afterWorkflow?.(this, this.variables);

    return terminalNodes.map(node => node.output);
  }

  addNode(node: WorkflowNode): void {
    if (this.nodes.some(n => n.id === node.id)) {
      throw new Error(`id为 ${node.id} 的节点已存在`);
    }
    this.nodes.push(node);
  }

  removeNode(nodeId: string): void {
    const index = this.nodes.findIndex(n => n.id === nodeId);
    if (index === -1) {
      throw new Error(`id为 ${nodeId} 的节点未找到`);
    }

    // 检查是否有节点依赖于此节点
    const dependentNodes = this.nodes.filter(n =>
      n.dependencies.includes(nodeId)
    );
    if (dependentNodes.length > 0) {
      throw new Error(
        `无法删除节点 ${nodeId}：依赖于它的节点包括 ${dependentNodes.map(n => n.id).join(", ")}`
      );
    }

    this.nodes.splice(index, 1);
  }

  getNode(nodeId: string): WorkflowNode {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) {
      throw new Error(`id为 ${nodeId} 的节点未找到`);
    }
    return node;
  }

  validateDAG(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        return true;
      }

      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = this.getNode(nodeId);
      for (const depId of node.dependencies) {
        if (hasCycle(depId)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    return !this.nodes.some(node => hasCycle(node.id));
  }
}
