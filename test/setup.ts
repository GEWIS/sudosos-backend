/* eslint-disable import/prefer-default-export */
import * as util from 'util';
import { generateKeyPair } from 'crypto';
import { use } from 'chai';
import chaiSwag from 'chai-swag';
import chaiHttp from 'chai-http';
import chaiAsPromised from 'chai-as-promised';

use(chaiAsPromised);
use(chaiHttp);
use(chaiSwag);

process.env.HTTP_PORT = '3001';
process.env.TYPEORM_CONNECTION = 'sqlite';
process.env.TYPEORM_DATABASE = ':memory:';

/**
 * Generates a basic RSA keypair.
 */
export async function generateKeys(): Promise<{ publicKey: string, privateKey: string }> {
  return util.promisify(generateKeyPair).bind(null, 'rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  })();
}

/**
 * @returns The __filename converted to the TypeScript source file
 */
export function sourceFile(file: string) {
  return file.replace('out/test/', 'test/').replace('.js', '.ts');
}
