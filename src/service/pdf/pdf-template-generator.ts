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
 * This is the module page of pdf-template-generator.
 *
 * @module internal/pdf
 */

import fs from 'fs';
import path from 'path';

export default class PdfTemplateGenerator {
  /**
   * Load an HTML template from the static/pdf directory and apply parameters.
   * @param templateFileName - The name of the template file (e.g., 'invoice.html')
   * @param data - The data object to apply to the template (keys will replace {{ key }} placeholders)
   * @returns The complete HTML string with parameters applied
   */
  public static applyTemplate(templateFileName: string, data: Record<string, any>): string {
    const templatePath = path.join(__dirname, '../../../static/pdf', templateFileName);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`PDF template not found: ${templatePath}`);
    }

    let template = fs.readFileSync(templatePath, 'utf-8');

    // Replace {{ key }} placeholders with values from data
    Object.entries(data).forEach(([key, value]) => {
      const placeholder = `{{ ${key} }}`;
      const replacement = value != null ? String(value) : '';
      template = template.replaceAll(placeholder, replacement);
    });

    return template;
  }

  /**
   * Load an HTML template from the static/pdf directory without applying parameters.
   * @param templateFileName - The name of the template file (e.g., 'invoice.html')
   * @returns The raw template string
   */
  public static loadTemplate(templateFileName: string): string {
    const templatePath = path.join(__dirname, '../../../static/pdf', templateFileName);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`PDF template not found: ${templatePath}`);
    }

    return fs.readFileSync(templatePath, 'utf-8');
  }
}

