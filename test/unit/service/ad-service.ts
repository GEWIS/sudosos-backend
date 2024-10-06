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

import { DataSource } from 'typeorm';
import express, { Application } from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import sinon from 'sinon';
import chai, { expect } from 'chai';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';
import User from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import Swagger from '../../../src/start/swagger';
import ADService from '../../../src/service/ad-service';
import LDAPAuthenticator from '../../../src/entity/authenticator/ldap-authenticator';
import { LDAPUser } from '../../../src/helpers/ad';
import userIsAsExpected from './authentication-service';
import { finishTestDB, restoreLDAPEnv, setDefaultLDAPEnv, storeLDAPEnv } from '../../helpers/test-helpers';
import { truncateAllTables } from '../../setup';
import { UserSeeder } from '../../seed';

chai.use(deepEqualInAnyOrder);

describe('AD Service', (): void => {
  let ctx: {
    connection: DataSource,
    app: Application,
    users: User[],
    spec: SwaggerSpecification,
    validADUser: (mNumber: number) => (LDAPUser),
  };

  const stubs: sinon.SinonStub[] = [];

  let ldapEnvVariables: { [key: string]: any; } = {};

  before(async function test(): Promise<void> {
    this.timeout(50000);

    ldapEnvVariables = storeLDAPEnv();
    setDefaultLDAPEnv();

    const connection = await Database.initialize();
    await truncateAllTables(connection);
    const app = express();
    await new UserSeeder().seed();

    const users = await User.find(
      {
        where: { deleted: false },
      },
    );

    const validADUser = (mNumber: number): LDAPUser => ({
      dn: `CN=Sudo SOS (m${mNumber}),OU=Member accounts,DC=gewiswg,DC=gewis,DC=nl`,
      memberOfFlattened: [
        'CN=Domain Users,CN=Users,DC=gewiswg,DC=gewis,DC=nl',
      ],
      givenName: `Sudo (${mNumber})`,
      sn: 'SOS',
      objectGUID: Buffer.from((mNumber.toString().length % 2 ? '0' : '') + mNumber.toString(), 'hex'),
      mNumber: mNumber,
      mail: `m${mNumber}@gewis.nl`,
      whenChanged: '202204151213.0Z',
      displayName: `Sudo (${mNumber})`,
    });

    ctx = {
      connection,
      app,
      users,
      validADUser,
      spec: await Swagger.importSpecification(),
    };
  });

  after(async () => {
    restoreLDAPEnv(ldapEnvVariables);
    await finishTestDB(ctx.connection);
  });

  afterEach(async () => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('createAccountIfNew function', () => {
    it('should create an account if GUID is unknown to DB', async () => {
      const adUser = { ...(ctx.validADUser(await User.count() + 200)) };
      // precondition.
      expect(await LDAPAuthenticator.findOne(
        { where: { UUID: adUser.objectGUID } },
      )).to.be.null;

      const userCount = await User.count();
      await new ADService().createAccountIfNew([adUser]);

      expect(await User.count()).to.be.equal(userCount + 1);
      const auth = (await LDAPAuthenticator.findOne(
        { where: { UUID: adUser.objectGUID }, relations: ['user'] },
      ));
      expect(auth).to.exist;
      const { user } = auth;
      userIsAsExpected(user, adUser);
    });
  });
});
