/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2020  Study association GEWIS
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
 */
import * as express from 'express';
import { SwaggerSpecification } from 'swagger-model-validator';
import Swagger from '../../../../src/start/swagger';
import { sourceFile } from '../../../setup';

/**
 * @typedef TestModel
 * @property {string} name.required - The name of the model.
 * @property {number} value.required - A test value.
 */
export class TestModel {
  name: string;

  value: number;
}

export async function getSpecification(app: express.Application): Promise<SwaggerSpecification> {
  return Swagger.generateSpecification(app, sourceFile(__filename));
}
