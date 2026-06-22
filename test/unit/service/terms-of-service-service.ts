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
import { promises as fs } from 'fs';
import { DataSource } from 'typeorm';
import TermsOfServiceService from '../../../src/service/terms-of-service-service';
import User, { TermsOfServiceStatus, UserType } from '../../../src/entity/user/user';
import TermsOfServiceAcceptance from '../../../src/entity/user/terms-of-service-acceptance';
import Database from '../../../src/database/database';
import { truncateAllTables } from '../../helpers/database-helpers';
import { finishTestDB } from '../../helpers/test-helpers';

describe('TermsOfServiceService', () => {
  const stubs: sinon.SinonStub[] = [];

  afterEach(() => {
    stubs.forEach((stub) => stub.restore());
    stubs.splice(0, stubs.length);
  });

  describe('listVersions', () => {
    it('should return all .md files stripped of extension, sorted ascending', async () => {
      const readdirStub = sinon.stub(fs, 'readdir').resolves(['2.0.md', '1.0.md', '1.1.md'] as any);
      stubs.push(readdirStub);

      const versions = await TermsOfServiceService.listVersions();

      expect(versions).to.deep.equal(['1.0', '1.1', '2.0']);
    });

    it('should ignore files that do not end with .md', async () => {
      const readdirStub = sinon.stub(fs, 'readdir').resolves(['1.0.md', 'test.txt', '2.0.md'] as any);
      stubs.push(readdirStub);

      const versions = await TermsOfServiceService.listVersions();

      expect(versions).to.deep.equal(['1.0', '2.0']);
    });

    it('should return an empty array when the directory contains no .md files', async () => {
      const readdirStub = sinon.stub(fs, 'readdir').resolves(['test.txt'] as any);
      stubs.push(readdirStub);

      const versions = await TermsOfServiceService.listVersions();

      expect(versions).to.be.an('array').that.is.empty;
    });

    it('should return the real TOS versions from disk', async () => {
      const versions = await TermsOfServiceService.listVersions();

      expect(versions).to.be.an('array');
      expect(versions.length).to.be.greaterThan(0);
      versions.forEach((v) => {
        expect(v).to.be.a('string');
        expect(v).to.not.include('.md');
      });
    });
  });

  describe('getTermsOfService', () => {
    it('should return the version, date and content for a valid version', async () => {
      const body = '# Terms of Service v1.0\nContent here.';
      const raw = `---\ndate: 2024-01-15\n---\n${body}`;
      const readFileStub = sinon.stub(fs, 'readFile').resolves(raw as any);
      stubs.push(readFileStub);

      const result = await TermsOfServiceService.getTermsOfService('1.0');

      expect(result.versionNumber).to.equal('1.0');
      expect(result.content).to.equal(body);
      expect(result.date).to.be.instanceOf(Date);
      expect(result.date.toISOString()).to.equal(new Date('2024-01-15').toISOString());
    });

    it('should throw an error when the version file does not exist', async () => {
      const readFileStub = sinon.stub(fs, 'readFile').rejects(new Error('ENOENT: no such file or directory'));
      stubs.push(readFileStub);

      await expect(TermsOfServiceService.getTermsOfService('99.9'))
        .to.eventually.be.rejectedWith('Terms of service version v99.9 not found');
    });

    it('should throw an error when the frontmatter is missing entirely', async () => {
      const readFileStub = sinon.stub(fs, 'readFile').resolves('# No frontmatter here\nJust content.' as any);
      stubs.push(readFileStub);

      await expect(TermsOfServiceService.getTermsOfService('1.0'))
        .to.eventually.be.rejectedWith('Terms of service version v1.0 has a missing or invalid frontmatter date');
    });

    it('should throw an error when the frontmatter has no date field', async () => {
      const raw = '---\ntitle: Some title\n---\n# Body\nContent.';
      const readFileStub = sinon.stub(fs, 'readFile').resolves(raw as any);
      stubs.push(readFileStub);

      await expect(TermsOfServiceService.getTermsOfService('1.0'))
        .to.eventually.be.rejectedWith('Terms of service version v1.0 has a missing or invalid frontmatter date');
    });

    it('should throw an error when the frontmatter date is invalid', async () => {
      const raw = '---\ndate: not-a-real-date\n---\n# Body\nContent.';
      const readFileStub = sinon.stub(fs, 'readFile').resolves(raw as any);
      stubs.push(readFileStub);

      await expect(TermsOfServiceService.getTermsOfService('1.0'))
        .to.eventually.be.rejectedWith('Terms of service version v1.0 has a missing or invalid frontmatter date');
    });

    it('should parse a date provided as a quoted string', async () => {
      const raw = '---\ndate: "2023-06-30"\n---\n# Body\nContent.';
      const readFileStub = sinon.stub(fs, 'readFile').resolves(raw as any);
      stubs.push(readFileStub);

      const result = await TermsOfServiceService.getTermsOfService('1.0');

      expect(result.date).to.be.instanceOf(Date);
      expect(result.date.toISOString()).to.equal(new Date('2023-06-30').toISOString());
    });

    it('should return the actual content and a valid date from disk', async () => {
      const versions = await TermsOfServiceService.listVersions();
      expect(versions.length).to.be.greaterThan(0);

      const version = versions[0];
      const result = await TermsOfServiceService.getTermsOfService(version);

      expect(result.versionNumber).to.equal(version);
      expect(result.content).to.be.a('string');
      expect(result.content.length).to.be.greaterThan(0);
      expect(result.date).to.be.instanceOf(Date);
      expect(Number.isNaN(result.date.getTime())).to.be.false;
    });
  });

  describe('getLatestTermsOfService', () => {
    it('should return the TOS with the highest version (last in sorted order)', async () => {
      const readdirStub = sinon.stub(fs, 'readdir').resolves(['1.0.md', '2.0.md', '1.5.md'] as any);
      stubs.push(readdirStub);
      const body = '# Latest TOS';
      const raw = `---\ndate: 2025-02-20\n---\n${body}`;
      const readFileStub = sinon.stub(fs, 'readFile').resolves(raw as any);
      stubs.push(readFileStub);

      const result = await TermsOfServiceService.getLatestTermsOfService();

      expect(result.versionNumber).to.equal('2.0');
      expect(result.content).to.equal(body);
      expect(result.date.toISOString()).to.equal(new Date('2025-02-20').toISOString());
    });

    it('should propagate a missing or invalid date error from the latest version', async () => {
      const readdirStub = sinon.stub(fs, 'readdir').resolves(['1.0.md', '2.0.md'] as any);
      stubs.push(readdirStub);
      const readFileStub = sinon.stub(fs, 'readFile').resolves('# No frontmatter' as any);
      stubs.push(readFileStub);

      await expect(TermsOfServiceService.getLatestTermsOfService())
        .to.eventually.be.rejectedWith('Terms of service version v2.0 has a missing or invalid frontmatter date');
    });

    it('should throw an error when no TOS files exist', async () => {
      const readdirStub = sinon.stub(fs, 'readdir').resolves([] as any);
      stubs.push(readdirStub);

      await expect(TermsOfServiceService.getLatestTermsOfService())
        .to.eventually.be.rejectedWith('No terms of service versions found');
    });

    it('should return the actual latest TOS version from disk', async () => {
      const versions = await TermsOfServiceService.listVersions();
      const expectedLatest = versions[versions.length - 1];

      const result = await TermsOfServiceService.getLatestTermsOfService();

      expect(result.versionNumber).to.equal(expectedLatest);
      expect(result.content).to.be.a('string');
      expect(result.content.length).to.be.greaterThan(0);
    });
  });

  describe('asTermsOfServiceResponse', () => {
    it('should serialize the date to an ISO string', () => {
      const date = new Date('2024-01-15');
      const response = TermsOfServiceService.asTermsOfServiceResponse({
        versionNumber: '1.0',
        date,
        content: '# Body',
      });

      expect(response.versionNumber).to.equal('1.0');
      expect(response.content).to.equal('# Body');
      expect(response.date).to.equal(date.toISOString());
    });
  });

  describe('getCurrentVersion', () => {
    beforeEach(() => {
      TermsOfServiceService.resetVersionCache();
    });

    afterEach(() => {
      TermsOfServiceService.resetVersionCache();
    });

    it('should return the highest version and cache it', async () => {
      const readdirStub = sinon.stub(fs, 'readdir').resolves(['1.0.md', '2.0.md', '1.5.md'] as any);
      stubs.push(readdirStub);

      expect(await TermsOfServiceService.getCurrentVersion()).to.equal('2.0');
      expect(await TermsOfServiceService.getCurrentVersion()).to.equal('2.0');
      expect(readdirStub.calledOnce).to.be.true;
    });

    it('should throw an error when no TOS files exist', async () => {
      const readdirStub = sinon.stub(fs, 'readdir').resolves([] as any);
      stubs.push(readdirStub);

      await expect(TermsOfServiceService.getCurrentVersion())
        .to.eventually.be.rejectedWith('No terms of service versions found');
    });
  });

  describe('user TOS status', () => {
    let connection: DataSource;
    let userRequired: User;
    let userNotRequired: User;
    let currentVersion: string;

    const saveUser = (firstName: string, tosRequired: boolean) => User.save({
      firstName,
      lastName: 'TOS',
      type: UserType.MEMBER,
      active: true,
      tosRequired,
    } as User);

    beforeAll(async () => {
      connection = await Database.initialize();
      await truncateAllTables(connection);
      TermsOfServiceService.resetVersionCache();
      currentVersion = await TermsOfServiceService.getCurrentVersion();
      userRequired = await saveUser('Required', true);
      userNotRequired = await saveUser('NotRequired', false);
    });

    afterAll(async () => {
      await finishTestDB(connection);
    });

    describe('getUserTosStatus', () => {
      it('should return NOT_REQUIRED when the user does not require the TOS', async () => {
        expect(await TermsOfServiceService.getUserTosStatus(userNotRequired))
          .to.equal(TermsOfServiceStatus.NOT_REQUIRED);
      });

      it('should return NOT_ACCEPTED when there is no acceptance record', async () => {
        expect(await TermsOfServiceService.getUserTosStatus(userRequired))
          .to.equal(TermsOfServiceStatus.NOT_ACCEPTED);
      });

      it('should return NOT_ACCEPTED when only an older version was accepted', async () => {
        const user = await saveUser('OldVersion', true);
        await TermsOfServiceAcceptance.save({
          userId: user.id, versionNumber: '0.9',
        } as TermsOfServiceAcceptance);

        expect(await TermsOfServiceService.getUserTosStatus(user))
          .to.equal(TermsOfServiceStatus.NOT_ACCEPTED);
      });

      it('should return ACCEPTED when the current version was accepted', async () => {
        const user = await saveUser('Accepted', true);
        await TermsOfServiceAcceptance.save({
          userId: user.id, versionNumber: currentVersion,
        } as TermsOfServiceAcceptance);

        expect(await TermsOfServiceService.getUserTosStatus(user))
          .to.equal(TermsOfServiceStatus.ACCEPTED);
      });
    });

    describe('haveUsersAcceptedCurrent', () => {
      it('should return true when all required users accepted the current version', async () => {
        const user = await saveUser('BulkAccepted', true);
        await TermsOfServiceAcceptance.save({
          userId: user.id, versionNumber: currentVersion,
        } as TermsOfServiceAcceptance);

        expect(await TermsOfServiceService.haveUsersAcceptedCurrent([user, userNotRequired]))
          .to.be.true;
      });

      it('should return false when a required user has not accepted the current version', async () => {
        expect(await TermsOfServiceService.haveUsersAcceptedCurrent([userRequired, userNotRequired]))
          .to.be.false;
      });

      it('should return true when no users require the TOS', async () => {
        expect(await TermsOfServiceService.haveUsersAcceptedCurrent([userNotRequired]))
          .to.be.true;
      });

      it('should return true for an empty list', async () => {
        expect(await TermsOfServiceService.haveUsersAcceptedCurrent([])).to.be.true;
      });
    });

    describe('getAcceptances', () => {
      it('should return all acceptance records of a user', async () => {
        const user = await saveUser('History', true);
        await TermsOfServiceAcceptance.save({
          userId: user.id, versionNumber: '0.9',
        } as TermsOfServiceAcceptance);
        await TermsOfServiceAcceptance.save({
          userId: user.id, versionNumber: currentVersion,
        } as TermsOfServiceAcceptance);

        const acceptances = await TermsOfServiceService.getAcceptances(user.id);
        expect(acceptances.map((a) => a.versionNumber))
          .to.have.members(['0.9', currentVersion]);
        acceptances.forEach((a) => {
          expect(a.createdAt).to.be.instanceOf(Date);
        });
      });

      it('should return an empty array for a user without acceptances', async () => {
        expect(await TermsOfServiceService.getAcceptances(userRequired.id)).to.be.empty;
      });
    });
  });
});



