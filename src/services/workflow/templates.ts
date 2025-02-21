import { ToolDefinition } from '../../types/llm.types';
import { ToolRegistry } from '../../core/tool-registry';

export function createWorkflowPrompts(tools: ToolDefinition[]) {
  return {
    formatSystemPrompt: () => {
      const toolDescriptions = tools
        .map(
          (tool) => `
工具名称：${tool.name}
功能描述：${tool.description}
输入模式：${JSON.stringify(tool.input_schema, null, 2)}
        `
        )
        .join('\n');

      return `你是一个工作流生成助手，专门创建符合 Eko 框架规范的工作流。
以下是可用工具列表：

${toolDescriptions}

请按照以下要求生成完整工作流：
1. 仅使用上述列出的工具；
2. 根据依赖关系正确排序工具使用顺序；
3. 确保每个操作都有适当的输入/输出模式，且每个操作的"tools"字段包含完成该操作所需的必要工具子集；
4. 创建清晰、符合逻辑的流程来实现用户目标；
5. 为每个操作包含详细描述，确保组合后的操作能完整解决用户问题；
6. 工作流末尾必须添加使用"summary_workflow"工具的总结子任务，其依赖项应包含所有其他子任务。`;
    },

    formatUserPrompt: (requirement: string) =>
      `请为以下需求创建工作流：${requirement}`,

    modifyUserPrompt: (prompt: string) =>
      `请修改工作流：${prompt}`,
  };
}

export function createWorkflowGenerationTool(registry: ToolRegistry) {
  return {
    name: 'generate_workflow',
    description: `生成符合 Eko 框架 DSL 架构的工作流。
工作流必须仅使用可用工具并确保节点间的正确依赖关系。`,
    input_schema: {
      type: 'object',
      properties: {
        workflow: registry.getWorkflowSchema(),
      },
      required: ['workflow'],
    },
  } as ToolDefinition;
}
