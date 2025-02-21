import { Tool, InputSchema, ExecutionContext } from '../../types/action.types';
import { createInterface } from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CommandExecuteParams {
  command: string;
  cwd?: string;
}

export class CommandExecute implements Tool<CommandExecuteParams, any> {
  name = 'command_execute';
  description = '在用户确认后执行 shell 命令';
  input_schema: InputSchema = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的命令。确保该命令是非交互式的，不需要用户输入。'
      },
      cwd: {
        type: 'string',
        description: '执行命令的工作目录'
      }
    },
    required: ['command']
  };

  private async getUserConfirmation(command: string): Promise<boolean> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise(resolve => {
      rl.question(`你确定要执行命令："${command}"？ (y/N) `, answer => {
        rl.close();
        resolve(answer.toLowerCase() === 'y');
      });
    });
  }

  async execute(context: ExecutionContext, params: CommandExecuteParams): Promise<any> {
    const confirmed = await this.getUserConfirmation(params.command);
    if (!confirmed) {
      return {
        executed: false,
        reason: '用户取消执行'
      };
    }

    try {
      const { stdout, stderr } = await execAsync(params.command, {
        cwd: params.cwd
      });
      return {
        executed: true,
        stdout,
        stderr
      };
    } catch (error) {
      const err = error as Error & { code?: number, stderr?: string };
      return {
        executed: false,
        error: err.message,
        code: err.code,
        stderr: err.stderr
      };
    }
  }
}
