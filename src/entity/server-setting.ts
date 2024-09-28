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

/**
 * This is the module page of the server-setting.
 *
 * @module internal/server-settings
 */

import { Column, Entity } from 'typeorm';
import BaseEntity from './base-entity';

export interface ISettings {
  highVatGroupId: number;
  jwtExpiryDefault: number;
  jwtExpiryPointOfSale: number;
  maintenanceMode: boolean;
}

/**
 * Key-value store
 */
@Entity()
export default class ServerSetting<T extends keyof ISettings = keyof ISettings> extends BaseEntity {
  @Column({ unique: true })
  public key: T;

  /**
   * JSON-stored value
   */
  @Column({
    type: 'text',
    transformer: {
      from(value: string | null): number[] | null {
        if (value == null) return null;
        return JSON.parse(value);
      },
      to(value: number[] | null): string | null {
        if (value == null) return null;
        return JSON.stringify(value);
      },
    },
  })
  public value: ISettings[T];
}
