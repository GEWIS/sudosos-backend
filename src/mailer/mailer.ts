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
 * This is the module page of mailer.
 *
 * @module internal/mailer
 */

import log4js, { Logger } from 'log4js';
import User from '../entity/user/user';
import MailMessage, { Language } from './mail-message';
import Mail from 'nodemailer/lib/mailer';
import { ConnectionOptions, Queue } from 'bullmq';
import Redis from 'ioredis';

enum MailQueues {
  SendEmail = 'send-email',
}

export default class Mailer {
  private static instance: Mailer;

  private mailQueue: Queue;

  private logger: Logger = log4js.getLogger('Mailer');

  constructor(redisConnection: Redis) {
    this.logger.level = process.env.LOG_LEVEL;

    const redisHost = process.env.REDIS_HOST || '127.0.0.1';
    const redisPort = Number(process.env.REDIS_PORT) || 6379;

    if (!redisHost || typeof redisHost !== 'string') {
      throw new Error('Invalid Redis configuration: REDIS_HOST must be a non-empty string.');
    }
    if (!Number.isInteger(redisPort) || redisPort <= 0) {
      throw new Error(
        `Invalid Redis configuration: REDIS_PORT must be a positive integer (got "${redisPort}").`,
      );
    }

    this.mailQueue = new Queue('mail-queue', {
      connection: redisConnection as unknown as ConnectionOptions,
    });
    Mailer.instance = this;
  }

  static getInstance(): Mailer {
    if (this.instance === undefined) {
      throw new Error('Mailer has not been initialized. Create an instance first using: new Mailer(redisConnection)');
    }
    return this.instance;
  }

  async send<T>(
    to: User,
    template: MailMessage<T>,
    language: Language = Language.ENGLISH,
    extraOptions?: Mail.Options,
  ) {
    const mailOptions = {
      ...template.getOptions(to, language),
      ...extraOptions,
      to: to.email,
    };
    try {
      await this.mailQueue.add(MailQueues.SendEmail, mailOptions, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      });

      this.logger.info({
        template: template.constructor.name,
        to: to.email,
      }, 'Email successfully queued');
    } catch (error) {
      this.logger.error({
        err: error.message,
        template: template.constructor.name,
        to: to.email,
      }, 'Failed to add email to queue');

      throw error;
    }


    this.logger.info(`Queued email: ${template.constructor.name} for ${to.email}`);
  }

  /**
   * TEST-ONLY FUNCTION to reset the singleton.
   * This is required in all test suites that use this object
   * to make sure they have the correct stubs
   */
  static reset() {
    this.instance = undefined;
  }
}
