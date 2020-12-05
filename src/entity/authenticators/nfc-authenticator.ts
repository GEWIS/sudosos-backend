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
  Column, Entity, JoinColumn, OneToOne,
} from 'typeorm';
import BaseEntityWithoutId from '../base-entity-without-id';
import User from '../user';

/**
 * @typedef {NfcAuthenticator} NfcAuthenticator
 * @property {User.model} user - The user this authenticator is for
 * @property {string} uid - The 7-byte UID of the NFC chip
 */
@Entity()
export default class NfcAuthenticator extends BaseEntityWithoutId {
  @OneToOne(() => User, { primary: true, nullable: false })
  @JoinColumn({ name: 'user' })
  public user: User;

  @Column({
    unique: true,
    length: 8,
  })
  public uid: string;
}
