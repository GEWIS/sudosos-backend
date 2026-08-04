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
import sinon, { SinonSandbox } from 'sinon';
import { DataSource } from 'typeorm';
import fs from 'fs';
import Mailer from '../../../src/mailer';
import User, { UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import HelloWorld from '../../../src/mailer/messages/hello-world';
import { Language } from '../../../src/mailer/mail-message';
import { truncateAllTables } from '../../helpers/database-helpers';
import { finishTestDB } from '../../helpers/test-helpers';
import { rootStubs } from '../../root-hooks';

describe('Mailer', () => {
  let ctx: {
    connection: DataSource,
    user: User,
    htmlMailTemplate: string,
  };

  let sandbox: SinonSandbox;

  beforeAll(async () => {
    const connection = await Database.initialize();
    await truncateAllTables(connection);
    const user = await User.save({
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      email: 'mail@example.com',
    } as User);

    const htmlMailTemplate = fs.readFileSync('./static/mailer/template.html').toString();

    ctx = {
      connection,
      user,
      htmlMailTemplate,
    };
  });

  beforeEach(() => {
    // root-hooks has already stubbed nodemailer.createTransport for this
    // test; rebuild the Mailer so it picks up the stub instead of a real
    // SMTP transporter cached from a previous test.
    Mailer.reset();
    new Mailer();
    sandbox = sinon.createSandbox();
  });

  afterAll(async () => {
    Mailer.reset();
    await finishTestDB(ctx.connection);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should be a singleton', () => {
    const mailer = Mailer.getInstance();
    const mailer2 = Mailer.getInstance();
    expect(mailer).to.equal(mailer2);
  });

  it('should reject access before initialization', () => {
    Mailer.reset();
    expect(() => Mailer.getInstance()).to.throw(/has not been initialized/);
  });

  const assertIncludesAll = (actual: string, substrings: string[]) => {
    substrings.forEach(sub => {
      expect(actual).to.include(sub, `Mail missing expected content: ${sub}`);
    });
  };

  // eslint-disable-next-line func-names
  it('should send English mail by default', async function () {
    const mailer = Mailer.getInstance();
    await mailer.send(ctx.user, new HelloWorld({ name: ctx.user.firstName }));

    expect(rootStubs!.sendMail.calledOnce).to.be.true;
    const [mailOptions] = rootStubs!.sendMail.firstCall.args as [{ to: string; html: string }];

    expect(mailOptions.to).to.equal(ctx.user.email);
    assertIncludesAll(mailOptions.html, [
      'Hello world!',
      'Dear Admin,',
      'Hello world, Admin!',
    ]);
  });

  // eslint-disable-next-line func-names
  it('should send Dutch mail when explicitly requested', async function () {
    const mailer = Mailer.getInstance();
    await mailer.send(ctx.user, new HelloWorld({ name: ctx.user.firstName }), Language.DUTCH);

    expect(rootStubs!.sendMail.calledOnce).to.be.true;
    const [mailOptions] = rootStubs!.sendMail.firstCall.args as [{ to: string; html: string }];

    expect(mailOptions.to).to.equal(ctx.user.email);
    assertIncludesAll(mailOptions.html, [
      'Hallo wereld!',
      'Beste Admin,',
      'Hallo wereld, Admin!',
    ]);
  });

  // eslint-disable-next-line func-names
  it('should reject when invalid language is provided', async function () {
    const mailer = Mailer.getInstance();
    const promise = mailer.send(ctx.user, new HelloWorld({ name: ctx.user.firstName }), 'binary' as any);
    await expect(promise).to.eventually.be.rejected;
  });

  it('should propagate SMTP failures', async () => {
    const mailer = Mailer.getInstance();
    (mailer as any).transporter.sendMail = sandbox.stub()
      .rejects(new Error('SMTP unavailable'));

    await expect(
      mailer.send(ctx.user, new HelloWorld({ name: ctx.user.firstName })),
    ).to.be.rejectedWith(/SMTP unavailable/);
  });
});
