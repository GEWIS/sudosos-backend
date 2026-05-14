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
import sinon from 'sinon';
import { Job } from 'bullmq';
import Mail from 'nodemailer/lib/mailer';
import {
  handleJobCompleted,
  handleJobFailed,
  processMailJob,
} from '../../../src/workers/mail-worker';

describe('mail-worker', () => {
  describe('processMailJob', () => {
    const makeJob = (overrides: Partial<Job<Mail.Options>> = {}): Job<Mail.Options> => ({
      id: 'job-1',
      data: { to: 'user@example.test', subject: 'Hi', text: 'hello' },
      ...overrides,
    }) as Job<Mail.Options>;

    it('forwards the job payload to the transporter and returns the response', async () => {
      const sendMail = sinon.stub().resolves({ messageId: 'msg-1' });
      const result = await processMailJob(makeJob(), { sendMail });

      expect(sendMail.calledOnce).to.be.true;
      expect(sendMail.firstCall.args[0]).to.deep.include({
        to: 'user@example.test',
        subject: 'Hi',
      });
      expect(result).to.deep.equal({ messageId: 'msg-1' });
    });

    it('re-throws when the transporter fails so BullMQ marks the job as failed', async () => {
      const sendMail = sinon.stub().rejects(new Error('SMTP exploded'));

      let caught: Error | undefined;
      try {
        await processMailJob(makeJob(), { sendMail });
      } catch (e) {
        caught = e as Error;
      }

      expect(caught).to.be.instanceOf(Error);
      expect(caught?.message).to.equal('SMTP exploded');
      expect(sendMail.calledOnce).to.be.true;
    });
  });

  describe('handleJobCompleted', () => {
    it('does not throw when invoked with a job', () => {
      expect(() => handleJobCompleted({ id: 'job-1' } as Job<Mail.Options>)).to.not.throw();
    });
  });

  describe('handleJobFailed', () => {
    it('does not throw when invoked with a job and an error', () => {
      expect(() => handleJobFailed({ id: 'job-1' } as Job<Mail.Options>, new Error('boom'))).to.not.throw();
    });

    it('does not throw when invoked with an undefined job', () => {
      expect(() => handleJobFailed(undefined, new Error('boom'))).to.not.throw();
    });
  });
});
