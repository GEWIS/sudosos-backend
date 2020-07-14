declare module 'express-swaggerize-ui' {
  import { RequestHandler } from 'express';

  export default function swaggerUi(): RequestHandler;
}
