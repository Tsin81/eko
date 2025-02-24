# Eko JSON 工作流 DSL

## 概览

一种基于 JSON 的特定领域语言，用于定义人工智能代理工作流，并针对 LLM 生成和编程操作进行了优化。

## 设计目标

1. Schema 兼容的 JSON 结构
2. 直接映射到运行时类型
3. 便于 LLM 生成和修改
4. 通过 JSON Schema 进行验证
5. 与运行时对象双向转换

JSON 结构

### 基础结构

```json
{
  "version": "1.0",
  "id": "string",
  "name": "string",
  "description": "string",
  "nodes": [Node],
  "variables": {
    "key": "value"
  }
}
```

### 节点结构

```json
{
  "id": "string",
  "type": "action | condition | loop",
  "dependencies": ["nodeId1", "nodeId2"],
  "input": {
    "type": "string",
    "schema": {}
  },
  "output": {
    "type": "string",
    "schema": {}
  },
  "action": {
    "type": "prompt | script | hybrid",
    "name": "string",
    "params": {},
    "tools": ["toolId1", "toolId2"]
  }
}
```

## 变量解析

- 使用 JSON 指针语法进行引用
- 例如 “/nodes/0/output/value "指首节点的输出值
- 参数中的变量使用 ${variableName} 语法

## 类型系统

- 使用 JSON Schema 进行类型定义
- 通过 Schema 进行运行时类型验证
- 支持基元（primitives）和复杂（complex）对象
- 存储有类型定义的 Schema

## 验证规则

1. 所有节点 ID 必须是唯一的
2. 依赖关系必须引用现有节点
3. 无循环依赖关系
4. 相连节点之间的类型兼容性
5. 必须提供所有必需参数
6. 所有工具必须注册并可用

## 错误类型

1. Schema 验证错误：无效的 JSON 结构
2. 引用错误：无效节点引用
3. 类型错误：节点之间的类型不兼容
4. 工具错误：工具不可用或无效

## 示例工作流

```json
{
  "version": "1.0",
  "id": "search-workflow",
  "name": "网页搜索工作流",
  "nodes": [
    {
      "id": "search",
      "type": "action",
      "action": {
        "type": "script",
        "name": "webSearch",
        "params": {
          "query": "${searchQuery}",
          "maxResults": 10
        }
      },
      "output": {
        "type": "array",
        "schema": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "title": {"type": "string"},
              "url": {"type": "string"}
            }
          }
        }
      }
    }
  ],
  "variables": {
    "searchQuery": "Eko framework github"
  }
}
```
