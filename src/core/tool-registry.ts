import { Tool } from '../types/action.types';
import { ToolDefinition } from '../types/llm.types';
import { workflowSchema } from '../schemas/workflow.schema';

export class ToolRegistry {
  private tools: Map<string, Tool<any, any>> = new Map();

  registerTool(tool: Tool<any, any>): void {
    this.tools.set(tool.name, tool);
  }

  unregisterTool(toolName: string): boolean {
    return this.tools.delete(toolName);
  }

  getTool(toolName: string): Tool<any, any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`名称为 ${toolName} 的工具未找到`);
    }
    return tool;
  }

  hasTools(toolNames: string[]): boolean {
    return toolNames.every(name => this.tools.has(name));
  }

  getAllTools(): Tool<any, any>[] {
    return Array.from(this.tools.values());
  }

  getToolDefinitions(): ToolDefinition[] {
    return this.getAllTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema
    })) as ToolDefinition[];
  }

  getToolEnum(): string[] {
    return Array.from(this.tools.keys());
  }

  // 通过当前工具获取 workflow schema
  getWorkflowSchema(): object {
    const schema = JSON.parse(JSON.stringify(workflowSchema)); // Deep clone

    // 将操作模式中的工具属性更新为使用当前工具的 enum。
    const actionProperties = schema.properties.nodes.items.properties.action.properties;
    actionProperties.tools = {
      type: 'array',
      items: {
        type: 'string',
        enum: this.getToolEnum()
      },
    };

    return schema;
  }
}
