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

import * as express from 'express';
import Validator, { SwaggerSpecification } from 'swagger-model-validator';
import Swagger from '../../../../src/start/swagger';

/**
 * @typedef {object} TestModel
 * @property {string} name.required - The name of the model.
 * @property {number} value.required - A test value.
 */
export class TestModel {
  name: string;

  value: number;
}

export async function getSpecification(app: express.Application): Promise<SwaggerSpecification> {
  // Under compiled JS, there are no .ts source files for express-jsdoc-swagger to scan,
  // and the JSDoc @typedef comments are stripped during compilation. Build the spec inline.
  if (__filename.endsWith('.js')) {
    const spec: any = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0', description: 'Test' },
      paths: {},
      components: {
        schemas: {
          TestModel: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'number' },
            },
            required: ['name', 'value'],
          },
        },
      },
    };
    new Validator(spec);
    app.use('/api-docs.json', (_: express.Request, res: express.Response) => res.json(spec));
    return spec as SwaggerSpecification;
  }
  return Swagger.generateSpecification(app, ['../../test/unit/entity/transformer/test-model.ts']);
}
