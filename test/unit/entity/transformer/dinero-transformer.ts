import { expect } from 'chai';
import dinero from 'dinero.js';
import DineroTransformer from '../../../../src/entity/transformer/dinero-transformer';

describe('DineroTransformer', (): void => {
  describe('#from', () => {
    it('should be able to convert integer value', () => {
      const value = DineroTransformer.Instance.from(123);
      expect(value.getAmount()).to.equal(123);
      expect(value.getCurrency()).to.equal(dinero.defaultCurrency);
      expect(value.getPrecision()).to.equal(dinero.defaultPrecision);
    });

    it('should fail to convert non-integer value', () => {
      const func = DineroTransformer.Instance.from.bind(null, 12.3);
      expect(func).to.throw('You must provide an integer.');
    });
  });

  describe('#to', () => {
    it('should be able to convert dinero value', async () => {
      const value = DineroTransformer.Instance.to(dinero({ amount: 123 }));
      expect(value).to.equal(123);
    });

    it('should fail to convert wrong precision value', () => {
      const func = DineroTransformer.Instance.to.bind(null, dinero({ amount: 123, precision: 3 }));
      expect(func).to.throw('Unsupported precision supplied.');
    });

    it('should fail to convert wrong currency value', () => {
      const func = DineroTransformer.Instance.to.bind(null, dinero({ amount: 123, currency: 'HRK' }));
      expect(func).to.throw('Unsupported currency supplied.');
    });
  });
});
