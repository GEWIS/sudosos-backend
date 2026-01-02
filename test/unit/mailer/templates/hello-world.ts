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

import { expect } from 'chai';
import HelloWorld from '../../../../src/mailer/messages/hello-world';
import { Language } from '../../../../src/mailer/mail-message';
import User, { TermsOfServiceStatus, UserType } from '../../../../src/entity/user/user';
import { UserFactory } from '../../../helpers/user-factory';
import { DataSource } from 'typeorm';
import database from '../../../../src/database/database';
import { finishTestDB } from '../../../helpers/test-helpers';

describe('HelloWorldTemplate', () => {
  let ctx: {
    connection: DataSource,
    user: User,
  };

  before(async () => {
    const connection = await database.initialize();
    const user = await (await UserFactory({
      firstName: 'Samuel',
      active: true,
      type: UserType.LOCAL_ADMIN,
      acceptedToS: TermsOfServiceStatus.ACCEPTED,
      email: 'test@example.com',
    } as User)).get();
    ctx = {
      connection,
      user,
    };
  });

  after(async () => {
    await finishTestDB(ctx.connection);
  });

  it('should build correct email in English', () => {
    const name = ctx.user.firstName;
    const template = new HelloWorld({ name });

    const options = template.getOptions(ctx.user, Language.ENGLISH);
    expect(options.text).to.contain(name);
    expect(options.html).to.contain(name);
    expect(options.subject).to.equal('Hello world!');
    expect(options.from).to.equal(process.env.SMTP_FROM);
    expect(options.to).to.equal(ctx.user.email);
  });
  it('should build correct email in Dutch', () => {
    const name = ctx.user.firstName;
    const template = new HelloWorld({ name });

    const options = template.getOptions(ctx.user, Language.DUTCH);
    expect(options.text).to.contain(name);
    expect(options.html).to.contain(name);
    expect(options.subject).to.equal('Hallo wereld!');
    expect(options.from).to.equal(process.env.SMTP_FROM);
    expect(options.to).to.equal(ctx.user.email);
  });
  it('throw error if language does not exist', () => {
    const name = ctx.user.firstName;
    const template = new HelloWorld({ name });

    const func = () => template.getOptions(ctx.user, 'binary' as any);
    expect(func).to.throw('Unknown language: binary');
  });
});
