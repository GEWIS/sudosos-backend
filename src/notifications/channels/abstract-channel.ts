/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
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


import { ParameterObject, TemplateObject } from '../notification-types';
import User from '../../entity/user/user';

/**
 * This is the module page of the abstract channel.
 *
 * @module internal/notifications/channels
 */

export abstract class NotificationChannel<
    TTemplate extends TemplateObject<TParams, TRendered>,
    TParams extends ParameterObject,
    TRendered,
> {
  abstract readonly templates: Record<string, TTemplate>;

  abstract apply(template: TTemplate, params: TParams): Promise<TRendered>;
  abstract send(user: User, content: TRendered): Promise<void>;

  supports(type: string): boolean {
    return type in this.templates;
  }

  getTemplate(type: string): TTemplate | undefined {
    return this.templates[type];
  }
}