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

export default class Swagger {
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

  public static generateNewSpecification(app: express.Application) {
    const options = {
      info: {
        version: process.env.npm_package_version,
        title: process.env.npm_package_name,
        description: process.env.npm_package_description,
      },
      baseDir: 'C:\\Users\\Samuel\\WebstormProjects\\GEWIS\\SudoSOS\\sudosos-backend\\src\\',
      // Glob pattern to find your jsdoc files
      filesPattern: [
        './controller/authentication-controller.ts',
        './controller/authentication-secure-controller.ts',
        './controller/root-controller.ts',
        './controller/banner-controller.ts',
        './controller/balance-controller.ts',
        './controller/container-controller.ts',
        './controller/debtor-controller.ts',

        './helpers/pagination.ts',

        './controller/request/*.ts',

        './controller/response/*.ts',
        './controller/response/**/*.ts',

        './entity/vat-group.ts',
        './entity/base-entity-without-id.ts',
        './entity/base-entity.ts',
      ],
      swaggerUIPath: '/api-docs',
      exposeSwaggerUI: true, // Expose Swagger UI
      exposeApiDocs: true, // Expose API Docs JSON
      apiDocsPath: '/api-docs.json',
    };

    const instance = expressJSDocSwagger(app)(options);

    instance.on('finish', (swaggerObject) => {
      console.log('Finish');
      void fs.writeFile(
        path.join(process.cwd(), 'out/swagger.json'),
        JSON.stringify(swaggerObject),
        { encoding: 'utf-8' },
      );
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

    // Generate Swagger specification on-demand in development environments.
    return Swagger.generateSpecification(app,
      path.join(process.cwd(), 'src/entity/*.ts'),
      path.join(process.cwd(), 'src/entity/**/*.ts'),
      path.join(process.cwd(), 'src/gewis/entity/*.ts'),
      path.join(process.cwd(), 'src/declaration/*.ts'),
      path.join(process.cwd(), 'src/**/controller/*.ts'),
      path.join(process.cwd(), 'src/**/controller/response/**/*.ts'),
      path.join(process.cwd(), 'src/**/controller/request/**/*.ts'),
      path.join(process.cwd(), 'src/**/helpers/pagination.ts'));
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
