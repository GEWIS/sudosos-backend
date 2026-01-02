# SudoSOS Backend Documentation

## Introduction

Welcome to the SudoSOS Backend documentation! This resource provides comprehensive information about the system's architecture, entities, services, and APIs. Whether you're a new contributor or an experienced developer, you'll find the information you need to work effectively with SudoSOS.

## What is SudoSOS?

SudoSOS is a comprehensive Point of Sale (POS) and financial management system built for Study Association GEWIS. The backend provides a robust REST API that powers:

- **Transaction Processing** - Real-time point-of-sale transactions
- **User Management** - Member accounts and authentication
- **Financial Operations** - Invoicing, deposits, and transfers
- **Product Management** - Product catalogues and inventory
- **Reporting** - Financial reports and analytics
- **Payment Integration** - Stripe payment processing

## Documentation Structure

### For New Developers

- **[SudoSOS 101](/0-welcome-to-sudosos)** - Introduction to SudoSOS and the problems it solves
- **[System Architecture](/architecture)** - Technical architecture and design patterns
- **[Contributing](/contributing)** - Set up your environment and guidelines for contributing
- **[API Documentation](https://sudosos.gewis.nl/api/api-docs/)** - Interactive Swagger API documentation

### API Reference

The complete API specification is available through Swagger:

- **[Production API](https://sudosos.gewis.nl/api/api-docs/)** - Live API documentation
- **[Local Development](http://localhost:3000/api-docs)** - API docs when running locally

### TypeDoc Reference

Detailed code documentation generated from source code is available in the [TypeDoc section](/typedoc/).

## Key Concepts

Understanding these core concepts helps you work effectively with SudoSOS:

### Entities

SudoSOS uses TypeORM entities to represent database tables:

- **Users** - System users including members, organs, and invoice accounts
- **Transactions** - Point-of-sale purchases and transfers
- **Invoices** - Financial invoices for outstanding balances
- **Products** - Items available for purchase
- **Containers** - Groups of related products
- **Points of Sale** - Physical or virtual POS locations

### Architecture Layers

The backend follows a layered architecture:

1. **Controllers** - Handle HTTP requests and responses
2. **Services** - Contain business logic
3. **Entities** - Database models
4. **RBAC** - Role-based access control
5. **Middleware** - Request processing pipeline

### Role-Based Access Control (RBAC)

SudoSOS uses a comprehensive RBAC system with three relationship levels:

- **All** - Permission applies to all resources
- **Organ** - Permission applies to organ-owned resources
- **Own** - Permission applies only to user's own resources

Example permission: `get:own:Transaction` allows users to view their own transactions.

### Versioning with Revisions

SudoSOS tracks historical changes using revisions:

- **Point of Sale Revisions** - Track POS configuration changes
- **Container Revisions** - Track container content changes
- **Product Revisions** - Track product price and details changes

This allows accurate historical reporting and auditing.

## Common Use Cases

### Making a Transaction

1. User authenticates with JWT token
2. Client sends transaction request to `/transactions`
3. Service validates products, containers, and balances
4. Transaction is created and balance is updated
5. Response includes transaction details

### Creating an Invoice

1. Identify transactions to invoice
2. Create transfer linking transactions
3. Generate invoice with line items
4. Update transaction rows to reference invoice
5. Send invoice to recipient

### Processing a Deposit

1. User initiates deposit via Stripe
2. Payment intent is created
3. User completes payment
4. Webhook confirms payment
5. User balance is credited

## Development Resources

### Testing

Tests are organised by type:

- **Unit Tests** - Test individual functions and methods
  - `test/unit/controller/` - Controller tests
  - `test/unit/service/` - Service tests
- **Integration Tests** - Test component interactions
- **Seed Data** - `test/seed/` - Test data generators

Run tests with:

```bash
npm run test
```

### Database

Development uses SQLite by default. Key commands:

- **Initialise database** - `npm run init:schema`
- **Run migrations** - `npm run migrate` (MariaDB)
- **Seed data** - `npm run seed`
- **Maintenance** - `npm run maintenance`

### Code Quality

Maintain code quality with:

- **Linting** - `npm run lint` or `npm run lint-fix`
- **Type Checking** - TypeScript strict mode enabled
- **Test Coverage** - `npm run coverage`

## Project Structure

```
src/
├── controller/          # API endpoints
│   ├── request/         # Request DTOs
│   └── response/        # Response DTOs
├── service/            # Business logic
├── entity/             # Database models
│   ├── transactions/   # Transaction entities
│   ├── user/          # User entities
│   ├── invoices/      # Invoice entities
│   ├── point-of-sale/ # POS entities
│   └── ...            # Other entities
├── rbac/              # Access control
├── helpers/           # Utilities
├── middleware/        # Express middleware
└── mailer/           # Email functionality

test/
├── unit/             # Unit tests
├── integration/      # Integration tests
├── helpers/         # Test utilities
└── seed/           # Test data
```

## Additional Resources

### External Documentation

- **[TypeORM Documentation](https://typeorm.io/)** - Database ORM used by SudoSOS
- **[Express.js Guide](https://expressjs.com/)** - Web framework
- **[Swagger/OpenAPI Spec](https://swagger.io/specification/)** - API documentation standard
- **[Mocha Testing Framework](https://mochajs.org/)** - Test framework
- **[Chai Assertion Library](https://www.chaijs.com/)** - Test assertions

### GEWIS Resources

- **[GitHub Repository](https://github.com/GEWIS/sudosos-backend)** - Source code
- **[Issue Tracker](https://github.com/GEWIS/sudosos-backend/issues)** - Bug reports and features
- **[Pull Requests](https://github.com/GEWIS/sudosos-backend/pulls)** - Ongoing development
- **[SudoSOS Dashboard](https://sudosos.gewis.nl/)** - Production system

## Getting Help

If you need assistance:

1. **Search the documentation** - Use the search feature to find relevant information
2. **Check existing issues** - Your question might already be answered
3. **Ask on Discord** - Join the GEWIS Discord for real-time help
4. **Contact ABC** - Reach out to ABC members for system-specific questions
5. **Create an issue** - Report bugs or request features on GitHub

## Contributing to Documentation

Documentation improvements are always welcome! To contribute:

1. Edit files in `docs/content/`
2. Follow the [documentation writing guidelines](/contributing#writing-standards)
3. Submit a pull request

Thank you for contributing to SudoSOS!
