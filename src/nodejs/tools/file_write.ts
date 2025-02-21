import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { writeFile, appendFile, access } from 'fs/promises';
import { constants } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';

export interface FileWriteParams {
  path: string;
  content: string;
  append?: boolean;
  encoding?: BufferEncoding;
}

export class FileWrite implements Tool<FileWriteParams, any> {
  name = 'file_write';
  description = '在用户确认后将内容写入文件';
  input_schema: InputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '写入文件的路径'
      },
      content: {
        type: 'string',
        description: '要写入文件的内容'
      },
      append: {
        type: 'boolean',
        description: '是否追加到现有文件（默认值：false）'
      },
      encoding: {
        type: 'string',
        description: '文件编码（默认：utf8）',
        enum: ['utf8', 'ascii', 'utf16le', 'base64', 'binary']
      }
    },
    required: ['path', 'content']
  };

  private async checkFileExists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async getUserConfirmation(path: string, exists: boolean, append: boolean): Promise<boolean> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const action = exists
      ? (append ? '追加' : '覆盖')
      : '创建';

    return new Promise(resolve => {
      rl.question(`确定要在 “${path}” 处运行 ${action} 文件吗？ (y/N) `, answer => {
        rl.close();
        resolve(answer.toLowerCase() === 'y');
      });
    });
  }

  async execute(context: ExecutionContext, params: FileWriteParams): Promise<any> {
    try {
      const fullPath = resolve(params.path);
      const exists = await this.checkFileExists(fullPath);
      const append = params.append || false;

      const confirmed = await this.getUserConfirmation(fullPath, exists, append);
      if (!confirmed) {
        return {
          success: false,
          reason: '用户取消操作'
        };
      }

      if (append) {
        await appendFile(fullPath, params.content, {
          encoding: params.encoding || 'utf8'
        });
      } else {
        await writeFile(fullPath, params.content, {
          encoding: params.encoding || 'utf8'
        });
      }

      return {
        success: true,
        path: fullPath,
        action: append ? 'append' : 'write'
      };
    } catch (error) {
      const err = error as Error & { code?: string };
      return {
        success: false,
        error: err.message,
        code: err.code
      };
    }
  }
}
