import { expect } from 'chai';
import * as express from 'express';

describe('test', (): void => {

  beforeEach((): void => {
    const app = express();
  });

  it('should start', (): void => {
    expect(true).to.be.true;
  }) 
});