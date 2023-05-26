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
import { expect } from 'chai';
import sinon from 'sinon';
import nodemailer, { Transporter } from 'nodemailer';
import { Connection } from 'typeorm';
import Mailer from '../../../src/mailer';
import User, { UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import HelloWorld from '../../../src/mailer/templates/hello-world';
import { Language } from '../../../src/mailer/templates/mail-template';

describe('Mailer', () => {
  let ctx: {
    connection: Connection,
    mailer?: Mailer,
    user: User,
  };

  const sandbox = sinon.createSandbox();

  const sendMailFake = sandbox.spy();
  const createTransportStub = sandbox.stub(nodemailer, 'createTransport').returns({
    sendMail: sendMailFake,
  } as any as Transporter);

  before(async () => {
    const connection = await Database.initialize();
    const user = await User.save({
      id: 1,
      firstName: 'Admin',
      type: UserType.LOCAL_ADMIN,
      active: true,
      email: 'mail@example.com',
    } as User);

    ctx = {
      connection,
      user,
    };
  });

  afterEach(() => {
    sandbox.resetHistory();
  });

  after(async () => {
    sandbox.restore();
    await ctx.connection.close();
  });

  it('should correctly create mailer', () => {
    ctx.mailer = Mailer.getInstance();

    expect(createTransportStub).to.be.calledOnceWithExactly({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      secure: process.env.SMTP_TLS === 'true',
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
      },
      from: process.env.SMTP_FROM,
      pool: true,
      maxConnections: parseInt(process.env.SMTP_MAX_CONNECTIONS || '', 10) || undefined,
    });
  });

  it('should be a singleton', () => {
    const mailer = Mailer.getInstance();
    expect(mailer).to.equal(ctx.mailer);
  });

  // eslint-disable-next-line func-names
  it('should correctly send mail in English by default', async function () {
    if (!ctx.mailer) this.skip();
    await ctx.mailer.send(ctx.user, new HelloWorld({ name: ctx.user.firstName }));

    expect(sendMailFake).to.be.calledOnceWithExactly({
      from: process.env.SMTP_FROM,
      text: 'Hello world, Admin!',
      html: '<p>Hello world, Admin!</p>',
      subject: 'Hello world!',
      to: 'mail@example.com',
    });
  });

  // eslint-disable-next-line func-names
  it('should correctly send mail in Dutch', async function () {
    if (!ctx.mailer) this.skip();
    await ctx.mailer.send(ctx.user, new HelloWorld({ name: ctx.user.firstName }), Language.DUTCH);

    expect(sendMailFake).to.be.calledOnceWithExactly({
      from: process.env.SMTP_FROM,
      text: 'Hallo wereld, Admin!',
      html: '<p>Hallo wereld, Admin!</p>',
      subject: 'Hallo wereld!',
      to: 'mail@example.com',
    });
  });

  // eslint-disable-next-line func-names
  it('should catch error if any exist', async function () {
    if (!ctx.mailer) this.skip();

    const promise = ctx.mailer.send(ctx.user, new HelloWorld({ name: ctx.user.firstName }), 'binary' as any);
    await expect(promise).to.eventually.be.fulfilled;
  });
});
