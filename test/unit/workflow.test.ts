import { WorkflowImpl } from '../../src/models/workflow';
import { WorkflowNode, Action, Tool, ExecutionContext, EkoConfig } from '../../src/types';

describe('工作流模板', () => {
  let workflow: WorkflowImpl;

  beforeEach(() => {
    workflow = new WorkflowImpl(
      'test-id',
      'Test Workflow',
      { workingWindowId: undefined } as EkoConfig,
    );
  });

  const createMockNode = (id: string, dependencies: string[] = []): WorkflowNode => ({
    id,
    name: `Node ${id}`,
    input: { items: [] },
    output: { name: "mock_output", description: "模拟输出", value: null },
    dependencies,
    action: {
      type: 'script',
      name: 'test',
      description: '测试',
      tools: [],
      execute: async () => ({ result: `已执行 ${id}` }),
    }
  });

  describe('节点管理', () => {
    test('应成功添加节点', () => {
      const node = createMockNode('node1');
      workflow.addNode(node);
      expect(workflow.nodes).toHaveLength(1);
      expect(workflow.getNode('node1')).toBe(node);
    });

    test('添加重复节点时应抛出', () => {
      const node = createMockNode('node1');
      workflow.addNode(node);
      expect(() => workflow.addNode(node)).toThrow();
    });

    test('应能成功移除节点', () => {
      const node = createMockNode('node1');
      workflow.addNode(node);
      workflow.removeNode('node1');
      expect(workflow.nodes).toHaveLength(0);
    });

    test('删除不存在的节点时应抛出', () => {
      expect(() => workflow.removeNode('nonexistent')).toThrow();
    });

    test('删除有依赖节点时应抛出', () => {
      const node1 = createMockNode('node1');
      const node2 = createMockNode('node2', ['node1']);
      workflow.addNode(node1);
      workflow.addNode(node2);
      expect(() => workflow.removeNode('node1')).toThrow();
    });
  });

  describe('DAG 校验', () => {
    test('应检测简单循环', () => {
      const node1 = createMockNode('node1', ['node2']);
      const node2 = createMockNode('node2', ['node1']);
      workflow.addNode(node1);
      workflow.addNode(node2);
      expect(workflow.validateDAG()).toBe(false);
    });

    test('应验证非循环图', () => {
      const node1 = createMockNode('node1');
      const node2 = createMockNode('node2', ['node1']);
      const node3 = createMockNode('node3', ['node1', 'node2']);
      workflow.addNode(node1);
      workflow.addNode(node2);
      workflow.addNode(node3);
      expect(workflow.validateDAG()).toBe(true);
    });
  });

  describe('执行', () => {
    test('应按正确顺序执行节点', async () => {
      const executed: string[] = [];

      const createExecutableNode = (id: string, dependencies: string[] = []): WorkflowNode => ({
        ...createMockNode(id, dependencies),
        action: {
          type: 'script',
          name: 'test',
          description: '测试',
          tools: [],
          execute: async () => {
            executed.push(id);
            return { result: `已执行 ${id}` };
          }
        }
      });

      const node1 = createExecutableNode('node1');
      const node2 = createExecutableNode('node2', ['node1']);
      const node3 = createExecutableNode('node3', ['node1', 'node2']);

      workflow.addNode(node1);
      workflow.addNode(node2);
      workflow.addNode(node3);

      await workflow.execute();

      expect(executed).toEqual(['node1', 'node2', 'node3']);
    });

    test('应在执行过程中抛出循环依赖', async () => {
      const node1 = createMockNode('node1', ['node2']);
      const node2 = createMockNode('node2', ['node1']);
      workflow.addNode(node1);
      workflow.addNode(node2);

      await expect(workflow.execute()).rejects.toThrow();
    });
  });
});
