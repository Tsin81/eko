import { ToolRegistry } from '../../src/core/tool-registry';
import { Tool, InputSchema } from '../../src/types/action.types';

class MockTool implements Tool<any, any> {
  constructor(
    public name: string,
    public description: string = '模拟工具说明',
    public input_schema: InputSchema = {
      type: 'object',
      properties: {
        param: { type: 'string' }
      }
    }
  ) {}

  async execute(params: unknown): Promise<unknown> {
    return { executed: true };
  }
}

describe('工具注册', () => {
  let registry: ToolRegistry;
  let mockTool: Tool<any, any>;

  beforeEach(() => {
    registry = new ToolRegistry();
    mockTool = new MockTool('mock_tool');
  });

  describe('工具管理', () => {
    test('应成功注册工具', () => {
      registry.registerTool(mockTool);
      expect(registry.getTool('mock_tool')).toBe(mockTool);
    });

    test('注册重复工具时应抛出', () => {
      registry.registerTool(mockTool);
      expect(() => registry.registerTool(mockTool)).toThrow();
    });

    test('应能成功地卸载工具', () => {
      registry.registerTool(mockTool);
      registry.unregisterTool('mock_tool');
      expect(() => registry.getTool('mock_tool')).toThrow();
    });

    test('卸载不存在工具时应抛出', () => {
      expect(() => registry.unregisterTool('non_existent')).toThrow();
    });

    test('应正确检查工具是否存在', () => {
      registry.registerTool(mockTool);
      expect(registry.hasTools(['mock_tool'])).toBe(true);
      expect(registry.hasTools(['non_existent'])).toBe(false);
      expect(registry.hasTools(['mock_tool', 'non_existent'])).toBe(false);
    });
  });

  describe('工具列举', () => {
    beforeEach(() => {
      registry.registerTool(new MockTool('tool1'));
      registry.registerTool(new MockTool('tool2'));
    });

    test('应获得所有工具', () => {
      const tools = registry.getAllTools();
      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.name)).toEqual(['tool1', 'tool2']);
    });

    test('应获得工具定义', () => {
      const definitions = registry.getToolDefinitions();
      expect(definitions).toHaveLength(2);
      expect(definitions[0]).toHaveProperty('name', 'tool1');
      expect(definitions[0]).toHaveProperty('description');
      expect(definitions[0]).toHaveProperty('input_schema');
    });

    test('应获得工具枚举', () => {
      const enumValues = registry.getToolEnum();
      expect(enumValues).toEqual(['tool1', 'tool2']);
    });
  });

  describe('工作流 schema 生成', () => {
    beforeEach(() => {
      registry.registerTool(new MockTool('tool1'));
      registry.registerTool(new MockTool('tool2'));
    });

    test('应生成有效的工作流 schema', () => {
      const schema = registry.getWorkflowSchema() as any;

      // 基本 schema 结构
      expect(schema).toHaveProperty('type', 'object');
      expect(schema.properties).toHaveProperty('nodes');

      // 操作 schema 中的工具枚举
      const actionTools = schema.properties.nodes.items.properties.action.properties.tools;
      expect(actionTools.items.enum).toEqual(['tool1', 'tool2']);
    });

    test('工具更改时应更新 schema', () => {
      let schema = registry.getWorkflowSchema() as any;
      expect(schema.properties.nodes.items.properties.action.properties.tools.items.enum)
        .toEqual(['tool1', 'tool2']);

      registry.registerTool(new MockTool('tool3'));
      schema = registry.getWorkflowSchema() as any;
      expect(schema.properties.nodes.items.properties.action.properties.tools.items.enum)
        .toEqual(['tool1', 'tool2', 'tool3']);

      registry.unregisterTool('tool2');
      schema = registry.getWorkflowSchema() as any;
      expect(schema.properties.nodes.items.properties.action.properties.tools.items.enum)
        .toEqual(['tool1', 'tool3']);
    });
  });
});
