import * as computer from '../computer';
import { ComputerUseParam, ComputerUseResult } from '../../types/tools.types';
import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';

/**
 * Fellou 计算机使用工具
 */
export class ComputerUse implements Tool<ComputerUseParam, ComputerUseResult> {
  name: string;
  description: string;
  input_schema: InputSchema;

  constructor() {
    this.name = 'computer_use';
    this.description = `使用鼠标和键盘与计算机交互，并进行屏幕截图。
* 这是一个浏览器图形界面，你无法访问地址栏或书签。必须通过截图、鼠标、键盘等输入方式操作浏览器。
* 某些操作需要处理时间，你可能需要等待并通过连续截图观察操作结果（例如点击提交按钮未响应时，请尝试重新截图）
* 在移动光标点击元素前，必须先通过截图确认目标元素的坐标位置。
* 若点击按钮/链接后未成功加载（即使已等待），请调整光标位置使光标尖端准确指向目标元素。
* 确保点击按钮/链接/图标等元素时，光标尖端始终位于元素中心位置`;
    this.input_schema = {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: `需执行的操作类型，可选值包括：
* \`key\`：触发键盘按键或组合键。
- 支持 robotgo 热键语法。
- 多键组合使用"+"符号连接。
- 示例："a"、"enter"、"ctrl+s"、"command+shift+a"、"num0"。
* \`type\`: 输入文本字符串。
* \`cursor_position\`: 获取光标当前屏幕像素坐标(x, y)。
* \`mouse_move\`: 移动光标至指定屏幕像素坐标(x, y)。
* \`left_click\`: 左键单击。
* \`left_click_drag\`: 左键拖拽至指定坐标(x, y)。
* \`right_click\`: 右键单击。
* \`double_click\`: 左键双击。
* \`screenshot\`: 屏幕截图。
* \`scroll\`: 滚动至指定屏幕坐标(x, y)。`,
          enum: [
            'key',
            'type',
            'mouse_move',
            'left_click',
            'left_click_drag',
            'right_click',
            'double_click',
            'screenshot',
            'cursor_position',
            'scroll',
          ],
        },
        coordinate: {
          type: 'array',
          description:
            '(x, y): 目标坐标，x表示距屏幕左边缘像素数，y表示距屏幕上边缘像素数。',
        },
        text: {
          type: 'string',
          description: '仅当 `action=type` 或 `action=key` 时必填。',
        },
      },
      required: ['action'],
    };
  }

  /**
   * 计算机
   *
   * @param {*} params { action: 'mouse_move', coordinate: [100, 200] }
   * @returns { success: true, coordinate?: [], image?: { type: 'base64', media_type: 'image/jpeg', data: '/9j...' } }
   */
  async execute(context: ExecutionContext, params: ComputerUseParam): Promise<ComputerUseResult> {
    if (params === null || !params.action) {
      throw new Error('参数无效。期望对象具有 “action” 属性。');
    }
    let result;
    switch (params.action) {
      case 'key':
        result = await computer.key(params.text as string, params.coordinate);
        break;
      case 'type':
        result = await computer.type(params.text as string, params.coordinate);
        break;
      case 'mouse_move':
        result = await computer.mouse_move(params.coordinate as [number, number]);
        break;
      case 'left_click':
        result = await computer.left_click(params.coordinate);
        break;
      case 'left_click_drag':
        result = await computer.left_click_drag(params.coordinate as [number, number]);
        break;
      case 'right_click':
        result = await computer.right_click(params.coordinate);
        break;
      case 'double_click':
        result = await computer.double_click(params.coordinate);
        break;
      case 'screenshot':
        result = await computer.screenshot();
        break;
      case 'cursor_position':
        result = await computer.cursor_position();
        break;
      case 'scroll':
        result = await computer.scroll(params.coordinate as [number, number]);
        break;
      default:
        throw Error(
          `参数无效。${params.action} 值未包含在 “action” 枚举中。`
        );
    }
    if (typeof result == 'boolean') {
      return { success: result };
    } else {
      return { success: true, ...result };
    }
  }
}
