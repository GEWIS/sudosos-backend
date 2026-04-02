# @gewis/sudosos-client

Auto-generated TypeScript-Axios client for the SudoSOS API. Published on npm as [`@gewis/sudosos-client`](https://www.npmjs.com/package/@gewis/sudosos-client).

This package lives inside the [SudoSOS Backend](https://github.com/GEWIS/sudosos-backend/tree/develop/client) monorepo (`client/`) and is generated from the backend's Swagger/OpenAPI spec.

---

## Installation

```bash
npm install @gewis/sudosos-client
# or
yarn add @gewis/sudosos-client
```

---

## Usage

### Unauthorized API usage

```typescript
import { BannersApi, Configuration } from '@gewis/sudosos-client';

const configuration = new Configuration({
  basePath: 'https://sudosos.gewis.nl/api/v1',
});

const bannersApi = new BannersApi(configuration);
bannersApi.getAllOpenBanners().then((res) => {
  console.log(res.data);
});
```

### Authorized API usage

All API methods accept a single object parameter (named properties, no positional `undefined` placeholders needed).

```typescript
import { AuthenticateApi, BalanceApi, Configuration } from '@gewis/sudosos-client';

const basePath = 'https://sudosos.gewis.nl/api/v1';
const configuration = new Configuration({ basePath });

// Authenticate with an API key
const { data } = await new AuthenticateApi(configuration).keyAuthentication({
  keyAuthenticationRequest: { key: 'API_KEY', userId: 0 },
});
const jwtToken = data.token;

// Use the token for authenticated requests
const authedConfig = new Configuration({
  basePath,
  accessToken: () => jwtToken,
});

const balanceApi = new BalanceApi(authedConfig);
balanceApi.getBalances().then((res) => {
  console.log(res.data);
});
```

For a more complete integration example, see [sudosos-frontend-common](https://github.com/GEWIS/sudosos-frontend-common).

---

## How the client is generated

The client is generated from the OpenAPI spec that the backend emits at build time (`out/swagger.json`). The generator is [`openapi-generator-cli`](https://openapi-generator.tech/) using the `typescript-axios` template with `useSingleRequestParameter=true`.

### Prerequisites

- Node.js 22+
- Java runtime (required by `openapi-generator-cli`)
- The backend's Swagger output must exist at `../out/swagger.json` — run `npm run swagger` from the backend root first

### Common commands

| Command | Description |
|---|---|
| `npm run gen` | Generate TypeScript source from `../out/swagger.json` into `src/` |
| `npm run build` | Compile `src/` to `dist/` |
| `npm run genbuild` | Run `gen` then `build` (full regeneration) |
| `npm run clean` | Remove `src/` and `dist/` |

### Regenerating after a backend change

```bash
# From the backend root — generate the OpenAPI spec first
npm run swagger      # produces out/swagger.json

# Then regenerate the client
cd client
npm run genbuild
```

Or use the one-shot helper from the backend root:

```bash
npm run client:gen   # runs npm run swagger, then cd client && npm install && npm run genbuild
```

---

## Contributing

This package is generated — do not edit files under `src/` by hand; they will be overwritten on the next `npm run gen`. To change the client's output, update the backend API and regenerate.

Issues and contributions go through the [SudoSOS Backend issue tracker](https://github.com/GEWIS/sudosos-backend/issues).
