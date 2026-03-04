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
import createSMTPTransporter from './transporter';
import { Transporter } from 'nodemailer';

enum MailQueues {
  SendEmail = 'send-email',
}

export default class Mailer {
  private static instance: Mailer;

  private mailQueue: Queue | undefined;

  private transporter: Transporter | undefined;

  private logger: Logger = log4js.getLogger('Mailer');

  /**
   * Create a Mailer instance.
   *
   * When a Redis connection is provided, emails are queued via BullMQ (production
   * behaviour). When no connection is provided the Mailer falls back to sending
   * emails directly through the SMTP transporter – useful for local development
   * where Redis may not be running.
   */
  constructor(redisConnection?: Redis) {
    this.logger.level = process.env.LOG_LEVEL;

    if (redisConnection) {
      this.mailQueue = new Queue('mail-queue', {
        connection: redisConnection as unknown as ConnectionOptions,
      });
      this.logger.info('Mailer initialised in queued mode (Redis).');
    } else {
      this.transporter = createSMTPTransporter();
      this.logger.warn(
        'Redis unavailable – Mailer running in direct-send mode. '
        + 'Emails will be sent synchronously without retries. '
        + 'Set REDIS_HOST / REDIS_PORT to enable queued sending.',
      );
    }

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

    if (this.mailQueue) {
      // Queued path – normal production behaviour.
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
    } else {
      // Direct-send fallback – no Redis available (e.g. local dev).
      try {
        await this.transporter.sendMail(mailOptions);

        this.logger.info({
          template: template.constructor.name,
          to: to.email,
        }, 'Email sent directly (no-Redis fallback)');
      } catch (error) {
        this.logger.error({
          err: error.message,
          template: template.constructor.name,
          to: to.email,
        }, 'Failed to send email directly');

        throw error;
      }
    }
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
