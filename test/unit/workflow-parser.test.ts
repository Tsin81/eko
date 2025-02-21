import { WorkflowParser } from '../../src/services/parser/workflow-parser';
import { ValidationResult } from '../../src/types/parser.types';
import { Workflow } from '../../src/types/workflow.types';

describe('工作流解析', () => {
  const validWorkflowJson = {
    version: "1.0",
    id: "test-workflow",
    name: "测试工作流",
    description: "一个测试工作流",
    nodes: [
      {
        id: "node1",
        name: "首节点",
        action: {
          type: "script",
          name: "testAction",
          tools: ["tool1", "tool2"]
        },
        output: {
          name: "output1",
          description: "中间结果"
        }
      },
      {
        id: "node2",
        name: "第二节点",
        dependencies: ["node1"],
        action: {
          type: "prompt",
          name: "promptAction"
        },
        output: {
          name: "output2",
          description: "最终结果"
        }
      }
    ],
    variables: {
      testVar: "value"
    }
  };

  describe('解析', () => {
    it('应能成功解析有效的工作流 JSON', () => {
      const json = JSON.stringify(validWorkflowJson);
      const workflow = WorkflowParser.parse(json);

      expect(workflow.id).toBe("test-workflow");
      expect(workflow.name).toBe("测试工作流");
      expect(workflow.description).toBe("一个测试工作流");
      expect(workflow.nodes).toHaveLength(2);
      expect(workflow.variables.get("testVar")).toBe("value");
    });

    it('应抛出无效 JSON', () => {
      const invalidJson = '{ 无效 json';
      expect(() => WorkflowParser.parse(invalidJson)).toThrow('无效 JSON');
    });

    it('应在验证错误时抛出', () => {
      const invalidWorkflow = {
        ...validWorkflowJson,
        nodes: [
          {
            id: "node1",
            name: "无效节点"
            // 缺少规定操作
          }
        ]
      };
      expect(() => WorkflowParser.parse(JSON.stringify(invalidWorkflow)))
        .toThrow('无效工作流');
    });
  });

  describe('序列化', () => {
    it('应将工作流序列化为 JSON 格式', () => {
      const json = JSON.stringify(validWorkflowJson);
      const workflow = WorkflowParser.parse(json);
      const serialized = WorkflowParser.serialize(workflow);
      const parsed = JSON.parse(serialized);

      expect(parsed.id).toBe(validWorkflowJson.id);
      expect(parsed.name).toBe(validWorkflowJson.name);
      expect(parsed.nodes).toHaveLength(validWorkflowJson.nodes.length);
    });
  });

  describe('验证', () => {
    it('应验证正确的工作流结构', () => {
      const result = WorkflowParser.validate(validWorkflowJson);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应捕捉遗漏的必填字段', () => {
      const invalidWorkflow = {
        id: "test-workflow",
        // 缺少名称和节点
      };
      const result = WorkflowParser.validate(invalidWorkflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('缺少必填字段'))).toBe(true);
    });

    it('应捕获无效的节点引用', () => {
      const workflowWithBadRef = {
        ...validWorkflowJson,
        nodes: [
          {
            id: "node1",
            name: "Node",
            action: { type: "script", name: "test" },
            dependencies: ["non-existent-node"]
          }
        ]
      };
      const result = WorkflowParser.validate(workflowWithBadRef);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'reference')).toBe(true);
    });

    it('应捕获重复的节点 ID', () => {
      const workflowWithDuplicates = {
        ...validWorkflowJson,
        nodes: [
          {
            id: "node1",
            name: "Node 1",
            action: { type: "script", name: "test" }
          },
          {
            id: "node1", // 重复 ID
            name: "Node 2",
            action: { type: "script", name: "test" }
          }
        ]
      };
      const result = WorkflowParser.validate(workflowWithDuplicates);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('节点 ID 重复'))).toBe(true);
    });

    it('应验证操作类型', () => {
      const workflowWithInvalidAction = {
        ...validWorkflowJson,
        nodes: [
          {
            id: "node1",
            name: "Node",
            action: { type: "invalid-type", name: "test" }
          }
        ]
      };
      const result = WorkflowParser.validate(workflowWithInvalidAction);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.message.includes('操作类型无效'))).toBe(true);
    });
  });

  describe('运行时转换', () => {
    it('应保留节点依赖关系', () => {
      const json = JSON.stringify(validWorkflowJson);
      const workflow = WorkflowParser.parse(json);
      const node2 = workflow.getNode('node2');
      expect(node2.dependencies).toContain('node1');
    });

    it('应为可选字段设置默认值', () => {
      const minimalNode = {
        version: "1.0",
        id: "test",
        name: "Test",
        nodes: [{
          id: "node1",
          action: { type: "script", name: "test" }
        }]
      };
      const workflow = WorkflowParser.parse(JSON.stringify(minimalNode));
      const node = workflow.getNode('node1');
      expect(node.dependencies).toEqual([]);
      expect(node.input).toBeDefined();
      expect(node.output).toBeDefined();
    });

    it('应保持输出规范', () => {
      const workflow = WorkflowParser.parse(JSON.stringify(validWorkflowJson));
      const node = workflow.getNode('node1');
      expect(node.output.name).toEqual(validWorkflowJson.nodes[0].output.name);
      expect(node.output.description).toEqual(validWorkflowJson.nodes[0].output.description);
    });
  });
});
