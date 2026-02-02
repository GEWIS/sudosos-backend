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
            
      await transporter.sendMail(job.data);
    },
    {
      connection: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
      },
      concurrency: 5, 
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed: ${err.message}`);
  });

  logger.info('Mail Worker is running and listening for jobs...');
};