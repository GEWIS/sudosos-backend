/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2024  Study association GEWIS
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

/**
 * This is the module page of the pdf-able.
 *
 * @module internal/files/pdf
 */

import Pdf from './pdf-file';
import BaseEntity from '../base-entity';
import User from '../user/user';
import {
  IPdfServiceBase,
  IStoredPdfService,
} from '../../service/pdf/pdf-service';
import { hashJSON } from '../../helpers/hash';

type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * Entities that persist a Pdf file should implement IPdfAble.
 */
export interface IPdfAble<S extends Pdf = Pdf> extends BaseEntity {
  pdf?: S;

  getPdfParamHash(): Promise<string>;

  /**
   * Create and persist the Pdf file and return the Pdf entity.
   * Implementations expect the configured pdfService to implement
   * createPdfWithEntity. If the configured service does not, calling
   * this will throw.
   */
  createPdf(): Promise<S>;

  getOwner(): Promise<User>;

  pdfService: IStoredPdfService<this, S>;
}

/**
 * PdfAble is a Mixin that allows entities to be converted to Pdf.
 * The mixin expects the instance to have a pdfService as typed above.
 */
export function PdfAble<TBase extends Constructor<BaseEntity>>(Base: TBase) {
  abstract class PdfAbleClass extends Base {
    /**
     * The id of the Pdf file.
     */
    abstract pdfId?: number;

    /**
     * The Pdf file.
     */
    abstract pdf?: Pdf;

    /**
     * The service that creates the Pdf file.
     * Can be either a byte-producing service plus optionally a stored-entity service.
     */
    abstract pdfService: IPdfServiceBase<this> & Partial<IStoredPdfService<this, Pdf>>;

    /**
     * Get the owner of the Pdf file.
     */
    abstract getOwner(): Promise<User>;

    /**
     * Create and persist the Pdf file, returning the Pdf entity.
     * The configured pdfService must implement createPdfWithEntity, otherwise this throws.
     */
    async createPdf(): Promise<Pdf> {
      return this.pdfService.createPdfWithEntity(this as any);
    }

    /**
     * Get the hash of the parameters of the Pdf file.
     */
    async getPdfParamHash(): Promise<string> {
      return hashJSON(await this.pdfService.getParameters(this as any));
    }

    /**
     * Get the Pdf file. If the Pdf file is not current, create it.
     * @param force If true, always create the Pdf file.
     */
    public async getOrCreatePdf(force: boolean = false): Promise<Pdf> {
      if (this.pdf && !force) {
        // check if pdf is current.
        if (await this.validatePdfHash()) return this.pdf;
      }

      return Promise.resolve(await this.createPdf());
    }

    /**
     * Validates if the Pdf matches the stored hash.
     */
    async validatePdfHash(): Promise<boolean> {
      if (!this.pdf) return false;
      const hash = await this.getPdfParamHash();

      return hash === this.pdf.hash;
    }
  }

  return PdfAbleClass;
}

/**
 * UnstoredPdfAble is for entities that only want the PDF bytes.
 */
export interface IUnstoredPdfAble {
  createPdf(): Promise<Buffer>;
  pdfService: IPdfServiceBase<this>;
}

export function UnstoredPdfAble<TBase extends Constructor>(Base: TBase) {
  abstract class UnstoredPdfAbleClass extends Base implements IUnstoredPdfAble {
    /**
     * The service that creates the Pdf buffer.
     * Can be either a LaTeX-based service (UnstoredPdfService) or HTML-based service (HtmlUnstoredPdfService).
     */
    abstract pdfService: IPdfServiceBase<UnstoredPdfAbleClass>;

    /**
     * Create the Pdf buffer.
     * This method generates the PDF and returns it as a Buffer.
     */
    async createPdf(): Promise<Buffer> {
      return this.pdfService.createPdfBuffer(this as UnstoredPdfAbleClass);
    }

    async createRaw(): Promise<Buffer> {
      return this.pdfService.createRaw(this as UnstoredPdfAbleClass);
    }

    /**
     * @deprecated Use createRaw() instead
     */
    async createTex(): Promise<Buffer> {
      return this.createRaw();
    }

    async getPdfParamHash(): Promise<string> {
      return hashJSON(await this.pdfService.getParameters(this as UnstoredPdfAbleClass));
    }
  }

  return UnstoredPdfAbleClass;
}
