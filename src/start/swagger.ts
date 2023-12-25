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
/* eslint-disable no-new */
import { promises as fs } from 'fs';
import * as path from 'path';
import express from 'express';
import swaggerUi from 'express-swaggerize-ui';
import Validator, { SwaggerSpecification } from 'swagger-model-validator';
import generateSpecAndMount from 'express-swagger-generator';
import expressJSDocSwagger from 'express-jsdoc-swagger';
import log4js, { Logger } from 'log4js';

export default class Swagger {
  private static logger: Logger = log4js.getLogger('SwaggerGenerator');

  /**
   * Generate Swagger specification on-demand and serve it.
   * @param app - The express application to mount on.
   * @param files - The files that need to be parsed.
   * @returns The Swagger specification with model validator.
   */
  public static generateSpecification(app: express.Application, ...files: string[])
    : SwaggerSpecification {
    const swagger = generateSpecAndMount(app);
    const swaggerOptions = {
      swaggerDefinition: {
        info: {
          title: process.env.npm_package_name,
          description: process.env.npm_package_description,
          version: process.env.npm_package_version,
        },
        host: process.env.API_HOST,
        basePath: process.env.API_BASEPATH,
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
      files,
    };

    const swaggerSpec = swagger(swaggerOptions) as SwaggerSpecification;
    new Validator(swaggerSpec);
    return swaggerSpec;
  }

  public static generateNewSpecification(app: express.Application): Promise<SwaggerSpecification> {
    return new Promise((resolve, reject) => {
      const options = {
        info: {
          version: process.env.npm_package_version,
          title: process.env.npm_package_name,
          description: process.env.npm_package_description,
        },
        'schemes': [
          'http',
          'https',
        ],
        servers: [
          {
            url: `http://${process.env.API_HOST}${process.env.API_BASEPATH}`,
            description: 'Development server',
          },
        ],
        security: {
          JWT: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
        baseDir: 'C:\\Users\\Samuel\\WebstormProjects\\GEWIS\\SudoSOS\\sudosos-backend\\src\\',
        // Glob pattern to find your jsdoc files
        filesPattern: [
          './controller/*.ts',
          './helpers/pagination.ts',

          './controller/request/*.ts',

          './controller/response/*.ts',
          './controller/response/**/*.ts',
          './gewis/controller/**/*.ts',
          './entity/vat-group.ts',
          './entity/base-entity-without-id.ts',
          './entity/base-entity.ts',
          './entity/user/*.ts',
          './entity/file/base-file.ts',
        ],
        swaggerUIPath: '/api-docs',
        exposeSwaggerUI: true, // Expose Swagger UI
        exposeApiDocs: true, // Expose API Docs JSON
        apiDocsPath: '/api-docs.json',
      };

      const instance = expressJSDocSwagger(app)(options);

      instance.on('finish', (swaggerObject) => {
        Swagger.logger.trace('Swagger specification generation finished');
        new Validator(swaggerObject);
        void fs.writeFile(
          path.join(process.cwd(), 'out/swagger.json'),
          JSON.stringify(swaggerObject),
          { encoding: 'utf-8' },
        );
        instance.removeAllListeners();
        resolve(swaggerObject); // Resolve the promise with the swaggerObject
      });

      instance.on('error', (error) => {
        Swagger.logger.error('Error generating Swagger specification:', error);
        instance.removeAllListeners();
        reject(error); // Reject the promise in case of an error
      });
    });
  }

  /**
   * Imports a pre-generated Swagger specification file.
   * @param file - The path to the Swagger JSON file.
   */
  public static async importSpecification(file = 'out/swagger.json'): Promise<SwaggerSpecification> {
    const contents = await fs.readFile(file, 'utf-8');
    const swaggerSpec = JSON.parse(contents);

    // Override settings from environment variables
    swaggerSpec.host = process.env.API_HOST;
    swaggerSpec.basePath = process.env.API_BASEPATH;

    new Validator(swaggerSpec);
    return swaggerSpec;
  }

  /**
   * Initializes the Swagger specification for the current environment and serve it.
   * Depending on the NODE_ENV, it will be generated on-demand or import a pre-generated
   * specification.
   * @param app - The express application which will serve the specification.
   */
  public static async initialize(app: express.Application): Promise<SwaggerSpecification> {
    if (process.env.NODE_ENV === 'production') {
      // Serve pre-generated Swagger specification in production environments.
      const specification = await Swagger.importSpecification();
      app.use('/api-docs.json', (_, res) => res.json(specification));
      app.use('/api-docs', swaggerUi());
      return specification;
    }

    return Swagger.generateNewSpecification(app);
  }
}

if (require.main === module) {
  // Only execute directly if this is the main execution file.
  const app = express();

  fs.mkdir('out', { recursive: true })
    .then(() => Swagger.generateNewSpecification(app));

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  // fs.mkdir('out', { recursive: true })
  //   .then(() => Swagger.initialize(app))
  //   .then((specification) => fs.writeFile(
  //     path.join(process.cwd(), 'out/swagger.json'),
  //     JSON.stringify(specification),
  //     { encoding: 'utf-8' },
  //   ));
}
