/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 *  @license
 */

/**
 * This is the module page of the task registry.
 *
 * @module tasks
 */

export interface TaskHandler<P = unknown> {
  readonly type: string;
  handle(payload: P): Promise<void>;
}

class TaskRegistry {
  private handlers = new Map<string, TaskHandler<any>>();

  public register<P>(handler: TaskHandler<P>): void {
    if (this.handlers.has(handler.type)) {
      throw new Error(`Task handler for type '${handler.type}' is already registered.`);
    }
    this.handlers.set(handler.type, handler);
  }

  public get(type: string): TaskHandler<any> | undefined {
    return this.handlers.get(type);
  }

  public has(type: string): boolean {
    return this.handlers.has(type);
  }

  public types(): string[] {
    return Array.from(this.handlers.keys());
  }

  public reset(): void {
    this.handlers.clear();
  }
}

export const taskRegistry = new TaskRegistry();
