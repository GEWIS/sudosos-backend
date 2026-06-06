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

import path from 'path';
import { promises as fs } from 'fs';
import matter from 'gray-matter';
import { TermsOfServiceResponse } from '../controller/response/terms-of-service-response';

/**
 * This is the module page of the terms-of-service-service.
 *
 * @module terms-of-service
 */

const TOS_DIR = path.join(__dirname, '../../static/terms-of-service');

export interface TermsOfService {
  versionNumber: string;
  date: Date;
  content: string;
}

export default class TermsOfServiceService {

  /**
   * Convert a TermsOfService data object to a TermsOfServiceResponse.
   */
  public static asTermsOfServiceResponse(tos: TermsOfService): TermsOfServiceResponse {
    return {
      versionNumber: tos.versionNumber,
      date: tos.date.toISOString(),
      content: tos.content,
    };
  }

  /**
   * Parse the required leading YAML frontmatter block holding the effective date.
   * Throws if the frontmatter or its date is missing or invalid.
   */
  private static parseFrontmatter(raw: string, version: string): { date: Date; content: string } {
    const { data, content } = matter(raw);
    if (!(data.date instanceof Date) && typeof data.date !== 'string') {
      throw new Error(`Terms of service version v${version} has a missing or invalid frontmatter date`);
    }
    const date = data.date instanceof Date ? data.date : new Date(data.date);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Terms of service version v${version} has a missing or invalid frontmatter date`);
    }
    return { date, content };
  }

  /**
   * List all available TOS versions, sorted ascending by version number.
   */
  public static async listVersions(): Promise<string[]> {
    const files = await fs.readdir(TOS_DIR);
    return files
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3)) // strip ".md"
      .sort((a, b) => {
        const aParts = a.split('.').map((p) => Number(p));
        const bParts = b.split('.').map((p) => Number(p));
        const len = Math.max(aParts.length, bParts.length);
        for (let i = 0; i < len; i++) {
          const aVal = aParts[i] ?? 0;
          const bVal = bParts[i] ?? 0;
          if (aVal !== bVal) {
            return aVal - bVal;
          }
        }
        return 0;
      });
  }

  /**
   * Get a specific TOS revision by version string (e.g. "1.0").
   * Throws an error if the version does not exist.
   */
  public static async getTermsOfService(version: string): Promise<TermsOfService> {
    // Check whether the version string is safe (no path traversal)
    if (/[/\\]|\.\./.test(version)) {
      throw new Error(`Terms of service version v${version} not found`);
    }
    const filePath = path.join(TOS_DIR, `${version}.md`);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch {
      throw new Error(`Terms of service version v${version} not found`);
    }
    const { date, content } = TermsOfServiceService.parseFrontmatter(raw, version);
    return { versionNumber: version, date, content };
  }

  /**
   * Get the latest TOS revision (highest version number).
   * Throws an error if no TOS files exist.
   */
  public static async getLatestTermsOfService(): Promise<TermsOfService> {
    const versions = await TermsOfServiceService.listVersions();
    if (versions.length === 0) {
      throw new Error('No terms of service versions found');
    }
    const latest = versions[versions.length - 1];
    return TermsOfServiceService.getTermsOfService(latest);
  }
}

