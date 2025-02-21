export const workflowSchema = {
  type: "object",
  required: ["id", "name", "nodes"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    nodes: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "type", "action"],
        properties: {
          id: { type: "string" },
          type: {
            type: "string",
            enum: ["action"],    // 暂时只用于操作节点；保留给未来的类型，如条件、循环等。
          },
          dependencies: {
            type: "array",
            items: { type: "string" },
          },
          output: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
            },
          },
          action: {
            type: "object",
            required: ["type", "name", "description"],
            properties: {
              type: {
                type: "string",
                // enum: ["prompt", "script", "hybrid"],
                enum: ["prompt"],
              },
              name: { type: "string" },
              description: { type: "string" },
              params: { type: "object" },
              tools: {
                type: "array",
                items: { type: "string" },   // 将动态填充工具注册表中的枚举值
              },
            },
          },
        },
      },
    },
    variables: {
      type: "object",
      additionalProperties: true,
    },
  },
};
