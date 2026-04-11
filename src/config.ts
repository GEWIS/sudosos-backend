/**
 *  SudoSOS back-end API service.
 *  Copyright (C) 2026 Study association GEWIS
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

import dotenv from 'dotenv';

dotenv.config();

export type DatabaseConnection = 'better-sqlite3' | 'postgres' | 'mariadb' | 'mysql';
const VALID_DATABASE_CONNECTIONS: readonly string[] = ['better-sqlite3', 'postgres', 'mariadb', 'mysql'];

export type StorageMethod = 'disk';
const VALID_STORAGE_METHODS: readonly string[] = ['disk'];

function getOptionalString(name: string): string | undefined {
  const value = process.env[name];
  if (value == null) return undefined;

  const trimmed = value.trim();
  // Node.js stringifies `process.env.X = undefined` as "undefined"
  return (trimmed === '' || trimmed === 'undefined') ? undefined : trimmed;
}

function getInteger(
  name: string,
  fallback: number,
): number {
  const rawValue = getOptionalString(name);
  if (rawValue == null) return fallback;

  const parsed = parseInt(rawValue, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function getBoolean(name: string, fallback: boolean = false): boolean {
  const rawValue = getOptionalString(name);
  if (rawValue == null) return fallback;

  return rawValue === 'true';
}

export default class Config {
  private static instance: Config | undefined;

  public readonly app: {
    name: string;
    nodeEnv: string | undefined;
    isDevelopment: boolean;
    isProduction: boolean;
    isTest: boolean;
    httpPort: number;
    logLevel: string;
    apiHost: string;
    apiBasePath: string;
    frontendUrl: string;
  };

  public readonly auth: {
    jwtKeyPath: string;
    bcryptRounds: number;
    bcryptRoundsPin: number;
    resetTokenExpiresInSeconds: number;
    qrAuthenticatorExpiresInMs: number;
  };

  public readonly currency: {
    code: string;
    precision: number;
  };

  public readonly database: {
    connection: DatabaseConnection;
    isSqlite: boolean;
    host: string | undefined;
    port: number;
    database: string;
    username: string | undefined;
    password: string | undefined;
    synchronize: boolean;
    logging: boolean;
    sslEnabled: boolean;
    sslCaCertsPath: string | undefined;
  };

  public readonly redis: {
    host: string;
    port: number;
    connectTimeoutMs: number;
  };

  public readonly ldap: {
    enabled: boolean;
    serverUrl: string | undefined;
    base: string | undefined;
    userBase: string | undefined;
    userFilter: string | undefined;
    bindUser: string | undefined;
    bindPassword: string | undefined;
    sharedAccountFilter: string | undefined;
    roleFilter: string | undefined;
    serviceAccountFilter: string | undefined;
  };

  public readonly stripe: {
    enabled: boolean;
    publicKey: string | undefined;
    privateKey: string | undefined;
    returnUrl: string | undefined;
    webhookSecret: string | undefined;
    minTopupAmount: number;
    maxBalanceAmount: number;
  };

  public readonly smtp: {
    enabled: boolean;
    from: string | undefined;
    host: string | undefined;
    port: number | undefined;
    tls: boolean;
    username: string | undefined;
    password: string | undefined;
    maxConnections: number | undefined;
  };

  public readonly pdf: {
    pdfGeneratorUrl: string;
    htmlPdfGeneratorUrl: string;
  };

  public readonly gewis: {
    gewiswebPublicToken: string | undefined;
    gewiswebJwtSecret: string | undefined;
    gewisdbApiKey: string | undefined;
    gewisdbApiUrl: string | undefined;
  };

  public readonly pagination: {
    defaultTake: number;
    maxTake: number;
  };

  public readonly mail: {
    financialResponsible: string | undefined;
  };

  public readonly websocket: {
    port: number;
  };

  public readonly files: {
    storageMethod: StorageMethod;
  };

  public readonly wrapped: {
    year: number;
  };

  private constructor() {
    const nodeEnv = getOptionalString('NODE_ENV');
    const isTest = nodeEnv === 'test';
    const defaultRedisConnectTimeoutMs = isTest ? 100 : 3000;

    const rawConnection = getOptionalString('TYPEORM_CONNECTION') ?? 'better-sqlite3';
    if (!VALID_DATABASE_CONNECTIONS.includes(rawConnection)) {
      throw new Error(`Unsupported TYPEORM_CONNECTION: '${rawConnection}'. Must be one of: ${VALID_DATABASE_CONNECTIONS.join(', ')}`);
    }
    const databaseConnection = rawConnection as DatabaseConnection;
    const isSqlite = databaseConnection === 'better-sqlite3';

    const stripeKeys = {
      STRIPE_PUBLIC_KEY: getOptionalString('STRIPE_PUBLIC_KEY'),
      STRIPE_PRIVATE_KEY: getOptionalString('STRIPE_PRIVATE_KEY'),
      STRIPE_RETURN_URL: getOptionalString('STRIPE_RETURN_URL'),
      STRIPE_WEBHOOK_SECRET: getOptionalString('STRIPE_WEBHOOK_SECRET'),
    };

    const smtpConfig = {
      SMTP_FROM: getOptionalString('SMTP_FROM'),
      SMTP_HOST: getOptionalString('SMTP_HOST'),
      SMTP_PORT: getOptionalString('SMTP_PORT'),
    };

    const gewisdbConfig = {
      GEWISDB_API_KEY: getOptionalString('GEWISDB_API_KEY'),
      GEWISDB_API_URL: getOptionalString('GEWISDB_API_URL'),
    };

    const ldapEnabled = getBoolean('ENABLE_LDAP');
    const ldapConfig = {
      LDAP_SERVER_URL: getOptionalString('LDAP_SERVER_URL'),
      LDAP_BASE: getOptionalString('LDAP_BASE'),
      LDAP_BIND_USER: getOptionalString('LDAP_BIND_USER'),
      LDAP_BIND_PW: getOptionalString('LDAP_BIND_PW'),
      LDAP_USER_FILTER: getOptionalString('LDAP_USER_FILTER'),
    };
    if (ldapEnabled) {
      const ldapEntries = Object.entries(ldapConfig);
      const missingKeys = ldapEntries
        .filter(([, value]) => value == null)
        .map(([key]) => key);
      if (missingKeys.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Config] ENABLE_LDAP is true but the following LDAP_* environment variables are missing: ${missingKeys.join(', ')}. LDAP sync will fail at runtime.`,
        );
      }
    }

    const sslEnabled = getBoolean('TYPEORM_SSL_ENABLED');
    const sslCaCertsPath = getOptionalString('TYPEORM_SSL_CACERTS') ?? '/etc/ssl/certs/ca-certificates.crt';

    const databaseName = getOptionalString('TYPEORM_DATABASE') ?? (isSqlite ? 'local.sqlite' : undefined);
    if (databaseName == null) {
      throw new Error('TYPEORM_DATABASE environment variable is not set.');
    }

    this.app = {
      name: getOptionalString('NAME') ?? 'sudosos-dev',
      nodeEnv,
      isDevelopment: nodeEnv === 'development',
      isProduction: nodeEnv === 'production',
      isTest,
      httpPort: getInteger('HTTP_PORT', 3000),
      logLevel: getOptionalString('LOG_LEVEL') ?? 'info',
      apiHost: getOptionalString('API_HOST') ?? 'localhost:3000',
      apiBasePath: getOptionalString('API_BASEPATH') ?? '/api/v1',
      frontendUrl: getOptionalString('URL') ?? 'http://localhost:5173',
    };

    this.auth = {
      jwtKeyPath: getOptionalString('JWT_KEY_PATH') ?? 'config/jwt.key',
      bcryptRounds: getInteger('BCRYPT_ROUNDS', 12),
      bcryptRoundsPin: getInteger('BCRYPT_ROUNDS_PIN', 1),
      resetTokenExpiresInSeconds: getInteger('RESET_TOKEN_EXPIRES', 3600),
      qrAuthenticatorExpiresInMs: getInteger('QR_AUTHENTICATOR_EXPIRES_IN', 5 * 60 * 1000),
    };

    this.currency = {
      code: getOptionalString('CURRENCY_CODE') ?? 'EUR',
      precision: getInteger('CURRENCY_PRECISION', 2),
    };

    this.database = {
      connection: databaseConnection,
      isSqlite,
      host: getOptionalString('TYPEORM_HOST'),
      port: getInteger('TYPEORM_PORT', databaseConnection === 'postgres' ? 5432 : 3306),
      database: databaseName,
      username: getOptionalString('TYPEORM_USERNAME'),
      password: getOptionalString('TYPEORM_PASSWORD'),
      synchronize: getBoolean('TYPEORM_SYNCHRONIZE'),
      logging: getBoolean('TYPEORM_LOGGING'),
      sslEnabled,
      sslCaCertsPath,
    };

    this.redis = {
      host: getOptionalString('REDIS_HOST') ?? 'localhost',
      port: getInteger('REDIS_PORT', 6379),
      connectTimeoutMs: getInteger('REDIS_CONNECT_TIMEOUT_MS', defaultRedisConnectTimeoutMs),
    };

    this.ldap = {
      enabled: ldapEnabled,
      serverUrl: ldapConfig.LDAP_SERVER_URL,
      base: ldapConfig.LDAP_BASE,
      userBase: getOptionalString('LDAP_USER_BASE'),
      userFilter: ldapConfig.LDAP_USER_FILTER,
      bindUser: ldapConfig.LDAP_BIND_USER,
      bindPassword: ldapConfig.LDAP_BIND_PW,
      sharedAccountFilter: getOptionalString('LDAP_SHARED_ACCOUNT_FILTER'),
      roleFilter: getOptionalString('LDAP_ROLE_FILTER'),
      serviceAccountFilter: getOptionalString('LDAP_SERVICE_ACCOUNT_FILTER'),
    };

    this.stripe = {
      enabled: Object.values(stripeKeys).every((value) => value != null),
      publicKey: stripeKeys.STRIPE_PUBLIC_KEY,
      privateKey: stripeKeys.STRIPE_PRIVATE_KEY,
      returnUrl: stripeKeys.STRIPE_RETURN_URL,
      webhookSecret: stripeKeys.STRIPE_WEBHOOK_SECRET,
      minTopupAmount: getInteger('MIN_TOPUP', 1000),
      maxBalanceAmount: getInteger('MAX_BALANCE', 15000),
    };

    const smtpPort = getOptionalString('SMTP_PORT');
    const smtpMaxConnections = getOptionalString('SMTP_MAX_CONNECTIONS');
    this.smtp = {
      enabled: smtpConfig.SMTP_FROM != null && smtpConfig.SMTP_HOST != null && smtpPort != null,
      from: smtpConfig.SMTP_FROM,
      host: smtpConfig.SMTP_HOST,
      port: smtpPort == null ? undefined : getInteger('SMTP_PORT', 587),
      tls: getBoolean('SMTP_TLS'),
      username: getOptionalString('SMTP_USERNAME'),
      password: getOptionalString('SMTP_PASSWORD'),
      maxConnections: smtpMaxConnections == null ? undefined : getInteger('SMTP_MAX_CONNECTIONS', 0) || undefined,
    };

    this.pdf = {
      pdfGeneratorUrl: getOptionalString('PDF_GEN_URL') ?? 'http://pdf:3001/pdf',
      htmlPdfGeneratorUrl: getOptionalString('HTML_PDF_GEN_URL') ?? 'http://pdf-compiler:80/api/v1',
    };

    this.gewis = {
      gewiswebPublicToken: getOptionalString('GEWISWEB_PUBLIC_TOKEN'),
      gewiswebJwtSecret: getOptionalString('GEWISWEB_JWT_SECRET'),
      gewisdbApiKey: gewisdbConfig.GEWISDB_API_KEY,
      gewisdbApiUrl: gewisdbConfig.GEWISDB_API_URL,
    };

    this.pagination = {
      defaultTake: getInteger('PAGINATION_DEFAULT', 25),
      maxTake: getInteger('PAGINATION_MAX', 500),
    };

    this.mail = {
      financialResponsible: getOptionalString('FINANCIAL_RESPONSIBLE'),
    };

    this.websocket = {
      port: getInteger('WEBSOCKET_PORT', 8080),
    };

    this.files = {
      storageMethod: (() => {
        const raw = getOptionalString('FILE_STORAGE_METHOD') ?? 'disk';
        if (!VALID_STORAGE_METHODS.includes(raw)) {
          throw new Error(`Unsupported FILE_STORAGE_METHOD: '${raw}'. Must be one of: ${VALID_STORAGE_METHODS.join(', ')}`);
        }
        return raw as StorageMethod;
      })(),
    };

    this.wrapped = {
      year: getInteger('WRAPPED_YEAR', new Date().getFullYear()),
    };
  }

  public static get(): Config {
    if (this.instance == null) {
      this.instance = new Config();
    }

    return this.instance;
  }

  public static reset(): void {
    this.instance = undefined;
  }
}
