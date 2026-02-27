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
import { Job, Worker } from 'bullmq';

const logger = log4js.getLogger('MailWorker');
const transporter = createSMTPTransporter();

export const startMailWorker = () => {
  const worker = new Worker<Mail.Options>(
    'mail-queue',
    async (job: Job<Mail.Options>) => {
      logger.info(`Processing job ${job.id} for ${job.data.to}`);

      try {
        const info = await transporter.sendMail(job.data);

        return info;
      } catch (error) {
        logger.error(
          { jobId: job.id, to: job.data.to, error: error.message },
          'Failed to send email via transporter',
        );

        throw error;
      }
    },
    {
      connection: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT) || 6379,
      },
      concurrency: 5, 
    },
  );

  worker.on('completed', (job) => {
    logger.info(`Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed: ${err.message}`);
  });

  logger.info('Mail Worker is running and listening for jobs...');

  return worker;
};