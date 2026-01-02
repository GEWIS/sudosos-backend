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
import { MigrationInterface, QueryRunner } from 'typeorm';

export class MemberAuthenticator1761324427011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.renameTable('member_authenticator', 'organ_membership');
    await queryRunner.renameColumn('organ_membership', 'authenticateAsId', 'organId');
  }
    
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.renameColumn('organ_membership', 'organId', 'authenticateAsId');
    await queryRunner.renameTable('organ_membership', 'member_authenticator');
  }
}
