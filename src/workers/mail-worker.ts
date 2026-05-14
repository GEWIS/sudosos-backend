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
import createSMTPTransporter from '../mailer/transporter';
import Mail from 'nodemailer/lib/mailer';
import log4js from 'log4js';
import { ConnectionOptions, Job, Worker } from 'bullmq';
import Redis from 'ioredis';

const logger = log4js.getLogger('MailWorker');

let defaultTransporter: Mail | undefined;
const getDefaultTransporter = (): Mail => {
  if (!defaultTransporter) {
    defaultTransporter = createSMTPTransporter();
  }
  return defaultTransporter;
};

/**
 * BullMQ job processor for the mail queue. Hands the job payload off to the
 * SMTP transporter and re-throws so BullMQ can mark the job as failed.
 *
 * Exposed as a standalone function so it can be unit tested with a stubbed
 * transporter; production code calls it via {@link startMailWorker}.
 */
export const processMailJob = async (
  job: Job<Mail.Options>,
  mailTransporter: Pick<Mail, 'sendMail'> = getDefaultTransporter(),
): Promise<unknown> => {
  logger.info(`Processing job ${job.id} for ${job.data.to}`);

  try {
    const info = await mailTransporter.sendMail(job.data);

    return info;
  } catch (error) {
    logger.error(
      { jobId: job.id, to: job.data.to, error: error.message },
      'Failed to send email via transporter',
    );

    throw error;
  }
};

/**
 * Event handler invoked when a mail job completes.
 */
export const handleJobCompleted = (job: Job<Mail.Options>): void => {
  logger.info(`Job ${job.id} completed successfully`);
};

/**
 * Event handler invoked when a mail job fails after all retries.
 */
export const handleJobFailed = (
  job: Job<Mail.Options> | undefined,
  err: Error,
): void => {
  logger.error(`Job ${job?.id} failed: ${err.message}`);
};

export const startMailWorker = (redisConnection: Redis) => {
  const worker = new Worker<Mail.Options>(
    'mail-queue',
    (job) => processMailJob(job),
    {
      connection: redisConnection as unknown as ConnectionOptions,
      concurrency: 5,
    },
  );

  worker.on('completed', handleJobCompleted);
  worker.on('failed', handleJobFailed);

  logger.info('Mail Worker is running and listening for jobs...');

  return worker;
};
