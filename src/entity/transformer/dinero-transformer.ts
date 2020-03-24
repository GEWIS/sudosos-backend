/* eslint-disable class-methods-use-this */
import dinero, { Dinero } from 'dinero.js';
import { ValueTransformer } from 'typeorm';

/**
 * A singleton class for converting monetary Dinero values from and to
 * integer database representation.
 */
export default class DineroTransformer implements ValueTransformer {
  private static instance: DineroTransformer;

  /**
   * Private constructor for Singleton pattern.
   */
  private constructor() { }

  /**
   * Get Singleton instance of the transformer.
   */
  public static get Instance() {
    if (!this.instance) {
      this.instance = new DineroTransformer();
    }
    return this.instance;
  }

  /**
   * Converts a monetary value to it's Dinero object representation.
   * @param value - the monetary value represented as integer.
   */
  public from(value: number): Dinero {
    return dinero({ amount: value });
  }

  /**
   * Converts a monetary value to it's database integer representation.
   * @param value - the monetary value represented in a Dinero object.
   */
  public to(value: Dinero): number {
    return value.getAmount();
  }
}
