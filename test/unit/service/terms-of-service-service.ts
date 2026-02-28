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
import TermsOfServiceService from '../../../src/service/terms-of-service-service';

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
    it('should return the correct version and content for a valid version', async () => {
      const content = '# Terms of Service v1.0\nContent here.';
      const readFileStub = sinon.stub(fs, 'readFile').resolves(content as any);
      stubs.push(readFileStub);

      const result = await TermsOfServiceService.getTermsOfService('1.0');

      expect(result.versionNumber).to.equal('1.0');
      expect(result.content).to.equal(content);
    });

    it('should throw an error when the version file does not exist', async () => {
      const readFileStub = sinon.stub(fs, 'readFile').rejects(new Error('ENOENT: no such file or directory'));
      stubs.push(readFileStub);

      await expect(TermsOfServiceService.getTermsOfService('99.9'))
        .to.eventually.be.rejectedWith("Terms of service version v'99.9' not found");
    });

    it('should return the actual content of the existing TOS version from disk', async () => {
      const versions = await TermsOfServiceService.listVersions();
      expect(versions.length).to.be.greaterThan(0);

      const version = versions[0];
      const result = await TermsOfServiceService.getTermsOfService(version);

      expect(result.versionNumber).to.equal(version);
      expect(result.content).to.be.a('string');
      expect(result.content.length).to.be.greaterThan(0);
    });
  });

  describe('getLatestTermsOfService', () => {
    it('should return the TOS with the highest version (last in sorted order)', async () => {
      const readdirStub = sinon.stub(fs, 'readdir').resolves(['1.0.md', '2.0.md', '1.5.md'] as any);
      stubs.push(readdirStub);
      const content = '# Latest TOS';
      const readFileStub = sinon.stub(fs, 'readFile').resolves(content as any);
      stubs.push(readFileStub);

      const result = await TermsOfServiceService.getLatestTermsOfService();

      expect(result.versionNumber).to.equal('2.0');
      expect(result.content).to.equal(content);
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
});



