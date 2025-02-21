import { Workflow, WorkflowNode, NodeInput, NodeOutput } from '../../types/workflow.types';
import { ValidationResult, ValidationError } from '../../types/parser.types';
import { WorkflowImpl } from '../../models/workflow';
import { ActionImpl } from '../../models/action';
import { EkoConfig } from '@/types';

export class WorkflowParser {
  /**
   * 将 JSON 字符串解析为运行时工作流对象
   * @throws {Error} 如果 JSON 无效或 schema 验证失败
   */
  static parse(json: string, ekoConfig: EkoConfig): Workflow {
    let parsed: any;

    try {
      parsed = JSON.parse(json);
    } catch (e) {
      throw new Error(`JSON 无效：${(e as Error).message}`);
    }

    const validationResult = this.validate(parsed);
    if (!validationResult.valid) {
      throw new Error(
        `工作流无效：${validationResult.errors.map((e) => e.message).join(', ')}`
      );
    }

    return this.toRuntime(parsed, ekoConfig);
  }

  /**
   * 将运行时工作流对象转换为 JSON 字符串
   */
  static serialize(workflow: Workflow): string {
    const json = this.fromRuntime(workflow);
    return JSON.stringify(json, null, 2);
  }

  /**
   * 根据 schema 验证工作流 JSON 结构
   */
  static validate(json: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    // 基本结构验证
    if (!json || typeof json !== 'object') {
      errors.push({
        type: 'schema',
        message: '工作流程必须是一个对象',
      });
      return { valid: false, errors };
    }

    const workflow = json as Record<string, any>;

    // 必填字段验证
    const requiredFields = ['id', 'name', 'nodes'];
    for (const field of requiredFields) {
      if (!(field in workflow)) {
        errors.push({
          type: 'schema',
          message: `缺少必填字段：${field}`,
          path: `/${field}`,
        });
      }
    }

    // Nodes validation
    if (!Array.isArray(workflow.nodes)) {
      errors.push({
        type: 'type',
        message: '节点必须是数组',
        path: '/nodes',
      });
    } else {
      const nodeIds = new Set<string>();

      // 验证每个节点
      workflow.nodes.forEach((node: any, index: number) => {
        if (!node.id) {
          errors.push({
            type: 'schema',
            message: `索引 ${index} 处的节点缺少 ID`,
            path: `/nodes/${index}/id`,
          });
        } else {
          if (nodeIds.has(node.id)) {
            errors.push({
              type: 'reference',
              message: `节点 ID 重复： ${node.id}`,
              path: `/nodes/${index}/id`,
            });
          }
          nodeIds.add(node.id);
        }

        // 验证依赖关系
        if (node.dependencies) {
          if (!Array.isArray(node.dependencies)) {
            errors.push({
              type: 'type',
              message: `节点 ${node.id} 的依赖必须是一个数组`,
              path: `/nodes/${index}/dependencies`,
            });
          } else {
            node.dependencies.forEach((depId: any) => {
              if (typeof depId !== 'string') {
                errors.push({
                  type: 'type',
                  message: `依赖id 必须是节点 ${node.id} 中的字符串`,
                  path: `/nodes/${index}/dependencies`,
                });
              }
            });
          }
        }

        // 验证操作
        if (!node.action) {
          errors.push({
            type: 'schema',
            message: `节点 ${node.id} 缺少操作`,
            path: `/nodes/${index}/action`,
          });
        } else {
          if (!['prompt', 'script', 'hybrid'].includes(node.action.type)) {
            errors.push({
              type: 'type',
              message: `节点 ${node.id} 的操作类型无效`,
              path: `/nodes/${index}/action/type`,
            });
          }
        }
      });

      // 验证依赖关系引用
      workflow.nodes.forEach((node: any) => {
        if (node.dependencies) {
          node.dependencies.forEach((depId: string) => {
            if (!nodeIds.has(depId)) {
              errors.push({
                type: 'reference',
                message: `节点 ${node.id} 引用了不存在的依赖项： ${depId}`,
                path: `/nodes/${workflow.nodes.findIndex((n: any) => n.id === node.id)}/dependencies`,
              });
            }
          });
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private static toRuntime(json: any, ekoConfig: EkoConfig): Workflow {
    const variables = new Map(Object.entries(json.variables || {}));
    const workflow = new WorkflowImpl(
      json.id,
      json.name,
      ekoConfig,
      json.description,
      [],
      variables,
      undefined,
      {
        logLevel: 'info',
        includeTimestamp: true,
      }
    );

    // 转换节点
    json.nodes.forEach((nodeJson: any) => {
      const action = ActionImpl.createPromptAction(
        nodeJson.action.name,
        nodeJson.action.description,
        // 以字符串形式传递工具名称，它们将在执行时解析
        nodeJson.action.tools || [],
        undefined, // 将在执行时注入 LLM 提供程序
        { maxTokens: 1000 }
      );

      const node: WorkflowNode = {
        id: nodeJson.id,
        name: nodeJson.name || nodeJson.id,
        description: nodeJson.description,
        dependencies: nodeJson.dependencies || [],
        input: { items: [] },
        output: nodeJson.output || {
          name: `${nodeJson.name || nodeJson.id}_output`,
          description: `节点 ${nodeJson.name || nodeJson.id} 的输出`,
          value: null,
        },
        action: action,
      };

      workflow.addNode(node);
    });

    return workflow;
  }

  /**
   * 将运行时工作流对象转换为 JSON 结构
   */
  private static fromRuntime(workflow: Workflow): unknown {
    return {
      version: '1.0',
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      nodes: workflow.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        description: node.description,
        dependencies: node.dependencies,
        output: node.output,
        action: {
          type: node.action.type,
          name: node.action.name,
          description: node.action.description,
          tools: node.action.tools
            .map((tool) => (typeof tool === 'string' ? tool : tool.name))
            .filter((tool) => tool !== 'write_context'),
        },
      })),
      variables: Object.fromEntries(workflow.variables),
    };
  }
}
