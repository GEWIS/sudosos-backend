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
  Entity,
  Column,
  ManyToOne,
  BeforeUpdate,
} from 'typeorm';
import BaseContainer from './base-container';
import Container from './container';

@Entity()
export default class ContainerRevision extends BaseContainer {
  @ManyToOne(() => Container, {
    primary: true,
    nullable: false,
    eager: true,
  })
  public readonly container: Container;

  @Column({
    primary: true,
    default: 1,
    nullable: false,
  })
  public revision: number;

  @BeforeUpdate()
  // eslint-disable-next-line class-methods-use-this
  denyUpdate() {
    throw new Error('Immutable entities cannot be updated.');
  }
}
