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
import Mailer from '../../../src/mailer';
import User, { UserType } from '../../../src/entity/user/user';
import Database from '../../../src/database/database';
import HelloWorld from '../../../src/mailer/messages/hello-world';
import { Language } from '../../../src/mailer/mail-message';
import { truncateAllTables } from '../../setup';
import { finishTestDB } from '../../helpers/test-helpers';
import fs from 'fs';
import { rootStubs } from '../../root-hooks';
import Redis from 'ioredis';
import nodemailer from 'nodemailer';

describe('Mailer', () => {
  let ctx: {
    connection: DataSource,
    user: User,
    htmlMailTemplate: string,
    mailer: Mailer,
  };

  let sandbox: SinonSandbox;
  let redis: Redis;

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

    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      maxRetriesPerRequest: null,
    });

    const mailer = new Mailer(redis);

    ctx = {
      connection,
      user,
      htmlMailTemplate,
      mailer,
    };
  });

  beforeEach(async () => {
    // Restore the default stub
    rootStubs?.mail.restore();

    try {
      Mailer.getInstance();
    } catch (e) {
      new Mailer(redis);
    }

    sandbox = sinon.createSandbox();
  });

  afterAll(async () => {
    Mailer.reset();
    if (redis) await redis.quit();
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

  const assertIncludesAll = (actual: string, substrings: string[]) => {
    substrings.forEach(sub => {
      expect(actual).to.include(sub, `Mail missing expected content: ${sub}`);
    });
  };

  // eslint-disable-next-line func-names
  it('should correctly queue mail in English by default', async function () {
    const mailer = Mailer.getInstance();
    const template = new HelloWorld({ name: ctx.user.firstName });
    await mailer.send(ctx.user, template);

    expect(rootStubs.queueAdd.calledOnce).to.be.true;
    const [jobName, jobData] = rootStubs.queueAdd.firstCall.args;

    expect(jobName).to.equal('send-email');
    assertIncludesAll(jobData.html, [
      'Hello world!',         // <--- Check 'e' vs 'a'
      'Dear Admin,',
      'Hello world, Admin!',  // <--- Check 'e' vs 'a'
    ]);
  });



  // eslint-disable-next-line func-names
  it('should correctly queue mail in Dutch', async function () {
    const mailer = Mailer.getInstance();
    await mailer.send(ctx.user, new HelloWorld({ name: ctx.user.firstName }), Language.DUTCH);

    expect(rootStubs.queueAdd.calledOnce).to.be.true;
    const [jobName, jobData] = rootStubs.queueAdd.firstCall.args;

    expect(jobName).to.equal('send-email');
    assertIncludesAll(jobData.html, [
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

  // eslint-disable-next-line func-names
  it('should send mail directly via SMTP when initialised without Redis', async function () {
    // The test's beforeEach restores the global nodemailer stub, so we
    // create our own for this test via the sandbox.
    const sendMailStub = sandbox.stub().resolves({ messageId: 'direct-test-id' });
    sandbox.stub(nodemailer, 'createTransport').returns({ sendMail: sendMailStub } as any);

    Mailer.reset();
    const noRedisMailer = new Mailer(/* no redis connection */);

    await noRedisMailer.send(ctx.user, new HelloWorld({ name: ctx.user.firstName }));

    // sendMail should have been called once with the correct recipient.
    expect(sendMailStub.calledOnce).to.be.true;
    expect(sendMailStub.firstCall.args[0]).to.have.property('to', ctx.user.email);

    // The BullMQ queue should not have been touched.
    expect(rootStubs.queueAdd.called).to.be.false;

    // Restore the singleton to the Redis-backed instance for subsequent tests.
    Mailer.reset();
    new Mailer(redis);
  });
});
