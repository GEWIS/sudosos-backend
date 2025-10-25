# Understanding the Codebase

This document provides a practical guide to working with the SudoSOS codebase, including common patterns, file organization, and development workflows.

::: tip Prerequisites
Read **[External Integrations](/general/4-external-integrations)** first to understand how SudoSOS connects to external systems before diving into the code.
:::

## Where to Find Things

### File Organization

The SudoSOS codebase follows a clear structure:

```
src/
├── controller/          # HTTP request handlers
├── service/            # Business logic
├── entity/             # Database models
├── middleware/         # Request processing
├── rbac/              # Role-based access control
├── gewis/             # GEWIS-specific integrations
├── helpers/           # Utility functions
├── errors/            # Custom error classes
├── files/             # File handling
├── mailer/            # Email functionality
└── start/             # Application startup
```

### Key Directories

- **API Routes** - Controller files define endpoints
- **Business Rules** - Service files implement logic
- **Database Schema** - Entity files define structure
- **Permissions** - RBAC definitions in controller policies
- **Tests** - Mirror the src structure in test directory
- **External Integrations** - `src/gewis/` for GEWIS-specific integrations

## Key Design Principles

### 1. Entities as Parameters

Services should accept entity objects, not IDs:

```typescript
// ✅ Good
function processTransaction(transaction: Transaction) {
  // Already have the entity loaded
}

// ❌ Avoid
function processTransaction(transactionId: number) {
  // Must query database again
}
```

This improves type safety and reduces database queries.

### 2. Service Responsibility

Services should:
- Contain business logic
- Validate domain rules
- Orchestrate operations
- Return typed responses

Services should NOT:
- Parse HTTP requests
- Format HTTP responses
- Handle authentication directly

### 3. Type Safety

TypeScript strict mode enforces:
- No implicit `any` types
- Strict null checks
- Consistent return types
- Proper error handling

### 4. Testing Strategy

- **Controller tests** - HTTP behaviour, status codes, RBAC
- **Service tests** - Business logic, validation, data integrity
- **Integration tests** - End-to-end flows

## Common Patterns

### Creating a Resource

When adding a new resource to SudoSOS, follow this pattern:

#### 1. Define Entity

```typescript
// src/entity/example.ts
@Entity('examples')
export class Example extends BaseEntity {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column()
  public name: string;

  @Column({ nullable: true })
  public description?: string;

  @CreateDateColumn()
  public createdAt: Date;

  @UpdateDateColumn()
  public updatedAt: Date;

  @DeleteDateColumn()
  public deletedAt?: Date;
}
```

#### 2. Create Service

```typescript
// src/service/example-service.ts
export default class ExampleService {
  constructor(private manager: EntityManager) {}

  public async createExample(data: CreateExampleParams): Promise<Example> {
    // Validation
    if (!data.name) {
      throw new Error('Name is required');
    }

    // Create entity
    const example = new Example();
    example.name = data.name;
    example.description = data.description;

    // Save to database
    return await this.manager.save(example);
  }

  public async getExamples(params: ExampleParams): Promise<Example[]> {
    const options = this.buildQueryOptions(params);
    return await this.manager.find(Example, options);
  }

  private buildQueryOptions(params: ExampleParams): FindManyOptions<Example> {
    const where: FindOptionsWhere<Example> = {};

    if (params.name) {
      where.name = Like(`%${params.name}%`);
    }

    return {
      where,
      order: { createdAt: 'DESC' },
      take: params.take,
      skip: params.skip,
    };
  }
}
```

#### 3. Add Controller

```typescript
// src/controller/example-controller.ts
export default class ExampleController extends BaseController {
  public async createExample(req: RequestWithToken, res: Response): Promise<void> {
    const { name, description } = req.body;
    this.logger.trace('Create example', name, 'by user', req.token.user);

    try {
      const example = await new ExampleService(this.manager).createExample({
        name,
        description,
      });

      res.status(201).json(example);
    } catch (error) {
      this.logger.error('Could not create example:', error);
      res.status(500).json('Internal server error.');
    }
  }

  public async getExamples(req: RequestWithToken, res: Response): Promise<void> {
    const params = parseRequestPagination(req);
    this.logger.trace('Get examples by user', req.token.user);

    try {
      const examples = await new ExampleService(this.manager).getExamples(params);
      res.json(examples);
    } catch (error) {
      this.logger.error('Could not get examples:', error);
      res.status(500).json('Internal server error.');
    }
  }
}
```

#### 4. Define Routes

```typescript
// src/controller/example-controller.ts
public static routes = {
  '/examples': {
    POST: {
      policy: async (req) => this.roleManager.can(req.token.roles, 'create', 'all', 'Example', ['*']),
      handler: this.createExample.bind(this),
    },
    GET: {
      policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Example', ['*']),
      handler: this.getExamples.bind(this),
    },
  },
  '/examples/:id(\\d+)': {
    GET: {
      policy: async (req) => this.roleManager.can(req.token.roles, 'get', 'all', 'Example', ['*']),
      handler: this.getExample.bind(this),
    },
  },
};
```

#### 5. Write Tests

```typescript
// test/unit/controller/example-controller.ts
describe('ExampleController', () => {
  describe('POST /examples', () => {
    it('should create an example if user has permission', async () => {
      const res = await request(ctx.app)
        .post('/examples')
        .set('Authorization', `Bearer ${ctx.adminToken}`)
        .send({ name: 'Test Example', description: 'Test Description' });

      expect(res.status).to.equal(201);
      expect(res.body.name).to.equal('Test Example');
    });

    it('should return 403 if user lacks permission', async () => {
      const res = await request(ctx.app)
        .post('/examples')
        .set('Authorization', `Bearer ${ctx.userToken}`)
        .send({ name: 'Test Example' });

      expect(res.status).to.equal(403);
    });
  });
});
```

### Querying Data

Use service methods that encapsulate TypeORM queries:

```typescript
// In service
public async getExamples(params: ExampleParams) {
  const options = this.buildQueryOptions(params);
  return this.manager.find(Example, options);
}

private buildQueryOptions(params: ExampleParams): FindManyOptions<Example> {
  const where: FindOptionsWhere<Example> = {};

  // Add filters
  if (params.name) {
    where.name = Like(`%${params.name}%`);
  }

  if (params.active !== undefined) {
    where.deletedAt = params.active ? IsNull() : Not(IsNull());
  }

  return {
    where,
    relations: params.includeRelations ? ['relatedEntity'] : [],
    order: { createdAt: 'DESC' },
    take: params.take,
    skip: params.skip,
  };
}
```

### Handling Errors

Follow consistent error handling patterns:

```typescript
try {
  // Operation
  const result = await this.service.performOperation();
  res.json(result);
} catch (error) {
  this.logger.error('Operation failed:', error);
  
  if (error instanceof ValidationError) {
    res.status(400).json(error.message);
  } else if (error instanceof NotFoundError) {
    res.status(404).json('Resource not found.');
  } else {
    res.status(500).json('Internal server error.');
  }
}
```

### RBAC Implementation

Implement role-based access control in controllers:

```typescript
// Static method for determining relation
static async getRelation(req: RequestWithToken): Promise<string> {
  const exampleId = asNumber(req.params.id);
  const example = await Example.findOne({
    where: { id: exampleId },
    relations: ['owner'],
  });

  if (!example) return 'all';

  if (example.owner.id === req.token.user) return 'own';
  if (example.owner.organ === req.token.user.organ) return 'organ';
  return 'all';
}

// Policy definition
'/:id(\\d+)': {
  GET: {
    policy: async (req) => this.roleManager.can(
      req.token.roles,
      'get',
      await ExampleController.getRelation(req),
      'Example',
      ['*']
    ),
    handler: this.getExample.bind(this),
  },
},
```

## Development Workflow

### Setting Up Development Environment

1. **Clone the repository**
2. **Install dependencies**: `npm install`
3. **Set up environment**: Copy `.env.example` to `.env`
4. **Generate JWT key**: `npm run generate-jwt-key`
5. **Build the project**: `npm run build`
6. **Initialize database**: `npm run db:init`
7. **Start development server**: `npm run dev`

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npx mocha -r ts-node/register --timeout 50000 --require ./test/setup.ts test/unit/controller/example-controller.ts

# Run tests with grep
npx mocha -r ts-node/register --timeout 50000 --require ./test/setup.ts test/unit/controller/example-controller.ts --grep "POST /examples"
```

### Database Management

```bash
# Initialize database
npm run db:init

# Run migrations
npm run db:migrate

# Reset database
npm run db:reset

# Seed test data
npm run db:seed
```

### Code Quality

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Run type checking
npm run type-check
```

## Testing Strategy

### Controller Tests
- Test HTTP behaviour and status codes
- Verify RBAC policies
- Test request/response formatting
- Mock service dependencies

### Service Tests
- Test business logic and validation
- Test data integrity
- Test error handling
- Use real database transactions

### Integration Tests
- Test end-to-end flows
- Test external integrations
- Test database operations
- Test authentication flows

## Common Gotchas

### Entity Relationships
- Always load required relations before using them
- Use `relations` option in queries
- Be careful with circular dependencies

### Database Transactions
- Wrap related operations in transactions
- Handle rollback scenarios
- Use proper error handling

### RBAC Policies
- Test all permission levels (all/organ/own)
- Verify relation determination logic
- Handle edge cases (deleted entities, etc.)

### TypeScript
- Use strict typing
- Avoid `any` types
- Handle nullable values properly
- Use proper error types

## Debugging Tips

### Logging
- Use structured logging with context
- Log at appropriate levels (trace, debug, info, warn, error)
- Include relevant identifiers (user ID, transaction ID, etc.)

### Database Queries
- Use TypeORM query logging in development
- Check generated SQL queries
- Verify query performance

### Error Handling
- Log full error objects
- Include stack traces
- Provide meaningful error messages

## Next Steps

Now that you understand the codebase, you can:

1. **[Contributing](/contributing)** - Set up your development environment and make your first contribution
2. **[API Documentation](https://sudosos.gewis.nl/api/api-docs/)** - Explore the API endpoints
3. **[TypeDoc Reference](/typedoc/)** - Detailed code documentation

Or go back to:
- **[External Integrations](/general/4-external-integrations)** - Review how SudoSOS connects to external systems
- **[Transaction Flows](/general/3-transaction-flows)** - Review how the core system works
- **[Core Concepts](/general/2-core-concepts)** - Review the business domain
- **[System Architecture](/general/1-architecture)** - Review the technical foundation
- **[SudoSOS 101](/general/0-welcome-to-sudosos)** - Review the introduction
