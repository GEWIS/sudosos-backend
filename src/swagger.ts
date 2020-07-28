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
import generateSpecAndMount from 'express-swagger-generator';

export default class Swagger {
  public static initialize(app: express.Application): object {
    const swagger = generateSpecAndMount(app);
    const swaggerOptions = {
      swaggerDefinition: {
        info: {
          title: process.env.npm_package_name,
          description: process.env.npm_package_description,
          version: process.env.npm_package_version,
        },
        host: 'localhost:3000',
        basePath: '/v1',
        produces: [
          'application/json',
        ],
        schemes: ['http', 'https'],
        securityDefinitions: {
          JWT: {
            type: 'apiKey',
            in: 'header',
            name: 'Authorization',
            description: '',
          },
        },
      },
      basedir: __dirname, // app absolute path
      files: [
        './entity/*.ts',
        './declaration/*.ts',
      ], // Path to the API handle folder
    };

    return swagger(swaggerOptions);
  }
}
