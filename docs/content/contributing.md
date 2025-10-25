# Contributing to SudoSOS

Thank you for considering contributing to SudoSOS! This guide provides specific guidelines for contributing to the SudoSOS backend project.

## Code of Conduct

We welcome contributions from everyone. You don't need to be an ABC member or experienced software engineer - everyone can contribute and learn.

## Before You Start

1. **Check existing work**: Search [GitHub issues](https://github.com/GEWIS/sudosos-backend/issues) and [pull requests](https://github.com/GEWIS/sudosos-backend/pulls) to avoid duplicating efforts.

2. **Discuss major changes**: For significant features or architectural changes, open an issue first to discuss the approach with maintainers.

3. **Read the documentation**: Start with [SudoSOS 101](/0-welcome-to-sudosos) to understand what SudoSOS is, then read the [System Architecture](/architecture) guide for technical details.

## Initial Setup

If you haven't set up your development environment yet, follow these steps:

### Prerequisites

Ensure you have installed:
- **[Node.js 22+](https://nodejs.org/)** - JavaScript runtime
- **[Git](https://git-scm.com/)** - Version control
- **[OpenSSL](https://www.openssl.org/)** - For JWT key generation (usually pre-installed)
- **[DB Browser for SQLite](https://sqlitebrowser.org/)** (optional) - Database viewer

### 1. Fork and Clone

Fork the repository on GitHub, then clone your fork:

```bash
git clone https://github.com/YOUR_USERNAME/sudosos-backend.git
cd sudosos-backend
git remote add upstream https://github.com/GEWIS/sudosos-backend.git
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

The default configuration uses SQLite, which is perfect for development.

### 4. Generate JWT Key

```bash
openssl genrsa -out config/jwt.key 2048
```

Verify the key:
```bash
head -1 config/jwt.key
# Should output: -----BEGIN RSA PRIVATE KEY-----
```

### 5. Build the Project

```bash
npm run swagger
npm run build
```

### 6. Initialise Database

```bash
rm local.sqlite  # Remove old database if it exists
npm run init:schema
```

This creates the schema, seeds data, and sets up roles.

### 7. Verify Setup

```bash
npm run test
```

All tests should pass. If not, review the previous steps.

### 8. Start Development Server

```bash
npm run watch
```

Visit `http://localhost:3000/api-docs` to see the API documentation.

## Common Development Tasks

### Running the Development Server

The development server includes hot reload for development:

```bash
npm run watch
```

Changes to TypeScript files automatically rebuild and restart the server.

### Managing the Database

Reset the database:

```bash
rm local.sqlite
npm run init:schema
```

Run migrations (for MariaDB/MySQL):

```bash
npm run migrate
```

### Getting an Authentication Token

Use the `/authentication/mock` endpoint to get a JWT token for testing:

```bash
curl -X POST http://localhost:3000/authentication/mock \
  -H "Content-Type: application/json" \
  -d '{"userId": 1}'
```

Use this token in Swagger UI or API requests.

### IDE Configuration

#### WebStorm / IntelliJ IDEA

Enable automatic ESLint fixing:

1. Go to **Preferences** → **Languages & Frameworks** → **JavaScript** → **Code Quality Tools** → **ESLint**
2. Enable "Run ESLint --fix on save"
3. Click **Apply**

#### Visual Studio Code

Install recommended extensions:
- ESLint
- TypeScript and JavaScript Language Features

The workspace includes configuration to format on save automatically.

### Troubleshooting

**Port Already in Use**: Change the port in `.env`:
```env
PORT=3001
```

**JWT Key Issues**: Regenerate the key:
```bash
rm config/jwt.key
openssl genrsa -out config/jwt.key 2048
```

**Database Locked (SQLite)**: Close any database viewer applications and restart the server.

**Tests Failing**: Reset the test database:
```bash
rm local.sqlite
npm run test-ci
```

## Writing Standards

### Language and Style

All code, documentation, and commit messages must follow these standards:

- **Use British English** (e.g., "behaviour" not "behavior")
- **Write short sentences** - keep them clear and focused
- **Use present tense** - "add feature" not "added feature"
- **Use active voice** - "service processes request" not "request is processed by service"

### Code Quality

- **Type safety**: Use strict TypeScript typing - avoid `any` types
- **No `reduce`**: Use `map`, `filter`, or `for` loops instead for better readability
- **Minimal type casting**: Design types properly to avoid casting
- **Keep files under 300 lines** - split larger files into focused modules
- **Follow DRY principle** - reuse existing code and avoid duplication

### Documentation

- **Document complex logic** with clear comments
- **Add JSDoc** to public APIs and controllers
- **Update documentation** when changing behaviour
- **Include examples** in documentation where helpful

## Development Workflow

Once your environment is set up, follow this workflow for contributions:

### 1. Create a Feature Branch

Create a branch from `develop`:

```bash
git checkout develop
git pull upstream develop
git checkout -b feat/your-feature-name
```

Branch naming:
- `feat/description` - new features
- `fix/description` - bug fixes
- `docs/description` - documentation
- `refactor/description` - code improvements
- `test/description` - test additions

### 3. Make Changes

Follow the [project coding standards](#coding-standards):

- Write tests before implementing features (TDD)
- Keep functions small and focused
- Use descriptive variable and function names
- Add JSDoc comments to public methods

### 4. Test Your Changes

Run the full test suite:

```bash
npm run test
```

Run specific test files:

```bash
npx mocha -r ts-node/register --timeout 50000 --require ./test/setup.ts test/unit/controller/transaction-controller.ts
```

Filter tests by name:

```bash
npx mocha -r ts-node/register --timeout 50000 --require ./test/setup.ts test/unit/controller/transaction-controller.ts --grep "should return 200"
```

Ensure all tests pass before committing.

### 5. Run Linter

Fix linting issues automatically:

```bash
npm run lint-fix
```

Check for remaining issues:

```bash
npm run lint
```

### 6. Commit Changes

Follow the [Conventional Commits](https://www.conventionalcommits.org/) standard:

```
<type>[optional scope]: <description>
```

**Types**:
- `feat` - new feature
- `fix` - bug fix
- `docs` - documentation only
- `style` - formatting, missing semicolons, etc.
- `refactor` - code change that neither fixes a bug nor adds a feature
- `test` - adding or updating tests
- `chore` - maintenance tasks

**Examples**:
```bash
git commit -m "feat(invoice): add invoice generation endpoint"
git commit -m "fix(auth): resolve JWT token expiration issue"
git commit -m "docs: update API documentation for transactions"
git commit -m "test(user): add tests for user creation"
```

**Guidelines**:
- Use imperative mood: "add" not "added" or "adds"
- Don't capitalise first letter
- No full stop at the end
- Keep under 72 characters

### 7. Push and Create Pull Request

Push your branch:

```bash
git push origin feat/your-feature-name
```

Create a pull request on GitHub:
- Target the `develop` branch
- Use a clear, descriptive title following commit format
- Describe what changed and why
- Reference related issues: "Closes #123" or "Relates to #456"
- Add screenshots for UI changes (if applicable)

## Coding Standards

### Service Layer

Services should accept entities as parameters, not IDs:

```typescript
// ✅ Good - accepts entity
function processTransaction(transaction: Transaction) {
  // ...
}

// ❌ Bad - accepts ID
function processTransaction(transactionId: number) {
  // ...
}
```

This improves cross-service usage and type safety.

### Testing

#### Test Structure

Tests should follow this pattern:

```typescript
describe('TransactionService', () => {
  describe('getTransactionInvoices', () => {
    it('should return invoices for transaction', async () => {
      // Arrange - set up test data
      const transaction = await createTransaction();
      
      // Act - execute the code
      const result = await service.getTransactionInvoices(transaction.id);
      
      // Assert - verify the result
      expect(result).to.be.an('array');
      expect(result.length).to.equal(1);
    });
  });
});
```

#### Test Requirements

- **Write tests before code** (Test-Driven Development)
- **Cover edge cases** - test error conditions and boundary values
- **Test all status codes** - verify 200, 400, 403, 404, 500, etc.
- **Verify RBAC** - test different user roles and permissions
- **Clean up after tests** - remove created data to prevent side effects

#### Running Tests

Standard test pattern:

```bash
npx mocha -r ts-node/register --timeout 50000 --require ./test/setup.ts <test-file>
```

### File Organisation

Keep files focused and maintainable:

- **Under 300 lines** - split larger files
- **Single responsibility** - each file should have one clear purpose
- **Logical grouping** - group related functions and classes
- **Clear naming** - file names should reflect content

### TypeScript Best Practices

```typescript
// ✅ Use strict typing
interface CreateUserParams {
  firstName: string;
  lastName: string;
  email: string;
}

function createUser(params: CreateUserParams): User {
  // implementation
}

// ❌ Avoid 'any' type
function createUser(params: any): any {
  // implementation
}

// ✅ Use readonly where appropriate
interface Config {
  readonly apiUrl: string;
  readonly timeout: number;
}

// ✅ Use enums for fixed sets of values
enum UserType {
  LOCAL_USER = 'LOCAL_USER',
  INVOICE = 'INVOICE',
  ORGAN = 'ORGAN',
}

// ❌ Avoid magic strings
function getUserType(user: User): string {
  return 'LOCAL_USER'; // Bad - use enum instead
}
```

## Pull Request Review Process

### What Reviewers Look For

Reviewers check for:
- **Code quality** - follows project standards
- **Test coverage** - adequate tests for changes
- **Documentation** - clear comments and docs
- **Breaking changes** - backwards compatibility
- **Performance** - no unnecessary inefficiencies

### Addressing Feedback

When reviewers request changes:

1. **Make the changes** in your branch
2. **Commit as fixup**:
   ```bash
   git commit --all --fixup HEAD
   git push
   ```
3. **Respond to comments** explaining your changes
4. **Request re-review** when ready

### Updating Commit Messages

If reviewers suggest commit message changes:

```bash
# For the last commit
git commit --amend

# Push the change
git push --force-with-lease
```

Never use `--force`, always use `--force-with-lease` for safety.

## Rebasing vs Merging

We prefer **rebasing** over merging to maintain a clean history.

### Rebasing Your Branch

Keep your branch up to date with `develop`:

```bash
git checkout feat/your-feature-name
git fetch upstream
git rebase upstream/develop
```

If conflicts occur, resolve them and continue:

```bash
# Resolve conflicts in your editor
git add .
git rebase --continue
```

Push the rebased branch:

```bash
git push --force-with-lease origin feat/your-feature-name
```

### Interactive Rebase

Clean up commit history before merging:

```bash
git rebase -i HEAD~3  # Last 3 commits
```

Use interactive rebase to:
- Squash fixup commits
- Reword commit messages
- Reorder commits

## After Your PR is Merged

Clean up your local repository:

```bash
# Delete remote branch
git push origin --delete feat/your-feature-name

# Switch to develop
git checkout develop

# Delete local branch
git branch -D feat/your-feature-name

# Update local develop
git pull upstream develop
```

## Common Scenarios

### Adding a New Endpoint

1. **Controller**: Add handler and route in `src/controller/`
2. **Service**: Implement business logic in `src/service/`
3. **RBAC**: Add permission checks in controller policy
4. **Tests**: Write controller and service tests
5. **Documentation**: Add JSDoc with Swagger annotations

Example controller:

```typescript
/**
 * @summary Get transaction invoices
 * @operationId getTransactionInvoices
 * @tags transactions - Transaction related endpoints
 * @param {integer} id.path.required - Transaction ID
 * @security JWT
 * @return {Array.<BaseInvoiceResponse>} 200 - Invoices for transaction
 * @return {string} 404 - Transaction not found
 */
public async getTransactionInvoices(req: RequestWithToken, res: Response): Promise<void> {
  // implementation
}
```

### Fixing a Bug

1. **Write a failing test** that reproduces the bug
2. **Fix the bug** to make the test pass
3. **Verify** existing tests still pass
4. **Document** the fix in commit message

### Refactoring Code

1. **Ensure tests exist** and pass before refactoring
2. **Make small changes** incrementally
3. **Run tests frequently** during refactoring
4. **Don't change behaviour** - only improve structure
5. **Update documentation** if public APIs change

## Getting Help

- **Documentation**: Start with [SudoSOS 101](/0-welcome-to-sudosos), then check the [System Architecture](/architecture) guide
- **Issues**: Search [existing issues](https://github.com/GEWIS/sudosos-backend/issues)
- **Discord**: Join the GEWIS Discord for real-time help
- **ABC Members**: Contact ABC members for architectural questions

## Recognition

All contributors are recognised in the project. Thank you for making SudoSOS better!

---

*For general GEWIS contribution guidelines, see the [GEWIS Contributing Guide](https://github.com/GEWIS/contributing).*

