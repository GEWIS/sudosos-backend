/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
 */
import {
  Entity, Index, JoinColumn, OneToOne, PrimaryColumn,
} from 'typeorm';
import User from '../user/user';
import BaseEntityWithoutId from '../base-entity-without-id';

/**
 * @typedef {AuthenticationMethod} NfcAuthenticator
 * @property {string} nfcCode.required - The UID of the NFC chip
 */
@Entity()
export default class NfcAuthenticator extends BaseEntityWithoutId {
  @Index({ unique: true })
  @PrimaryColumn({ unique: true })
  public nfcCode: string;

  @PrimaryColumn({ unique: true })
  public userId: number;

  @OneToOne(() => User, { nullable: false, eager: true })
  @JoinColumn({ name: 'userId' })
  public user: User;
}
