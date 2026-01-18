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
 * This is the module page of the user-setting.
 *
 * @module internal/user-settings
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import BaseEntity from './base-entity';
import User from './user/user';

export interface DashboardTheme {
  organId: number;
  organName: string;
}

export const SUPPORTED_LANGUAGES = ['nl-NL', 'en-US', 'pl-PL'] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export interface IUserSettings {
  betaEnabled: boolean;
  dashboardTheme: DashboardTheme | null;
  language: SupportedLanguage | undefined;
}

/**
 * Key-value store for user-specific settings
 */
@Entity()
@Unique(['userId', 'key'])
@Index(['userId', 'key'])
export default class UserSetting<T extends keyof IUserSettings = keyof IUserSettings> extends BaseEntity {
  @Column({
    type: 'integer',
    nullable: false,
  })
  public userId: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  public user: User;

  @Column({
    length: 64,
    nullable: false,
  })
  public key: T;

  /**
   * JSON-stored value
   */
  @Column({
    type: 'text',
    nullable: true,
    transformer: {
      from(value: string | null): IUserSettings[T] | null {
        if (value == null) return null;
        return JSON.parse(value);
      },
      to(value: IUserSettings[T] | null | undefined): string | null {
        if (value == null) return null;
        return JSON.stringify(value);
      },
    },
  })
  public value: IUserSettings[T];
}
