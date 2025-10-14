<div align="center">

<!-- Centered Logo Image -->
<img src="https://github.com/GEWIS/sudosos-backend/blob/develop/backend_logo.png?raw=true" alt="SudoSOS Backend Logo" style="width:200px;height:auto;">

<!-- Centered Name Beneath Logo -->
<h1>SudoSOS Backend</h1>

<p align="center">
  <strong>A comprehensive Point of Sale and Financial Management System for Study Association GEWIS</strong>
</p>

[![Coverage Status](https://coveralls.io/repos/github/GEWIS/sudosos-backend/badge.svg?branch=develop)](https://coveralls.io/github/GEWIS/sudosos-backend?branch=develop)
[![Uptime](https://uptime.gewis.nl/api/badge/2/uptime)](https://sudosos.gewis.nl/api/v1/ping)
[![Build](https://img.shields.io/github/actions/workflow/status/GEWIS/sudosos-backend/release.yml?branch=main&label=Build)](https://github.com/GEWIS/sudosos-backend/actions/workflows/release.yml)
[![Latest Release](https://img.shields.io/github/v/tag/GEWIS/sudosos-backend?label=Latest)](https://github.com/GEWIS/sudosos-backend/releases)
[![Issues](https://img.shields.io/github/issues/GEWIS/sudosos-backend)](https://github.com/GEWIS/sudosos-backend/issues)
[![Commit Activity](https://img.shields.io/github/commit-activity/m/GEWIS/sudosos-backend)](https://github.com/GEWIS/sudosos-backend/commits/develop)
[![Code Size](https://img.shields.io/github/languages/code-size/GEWIS/sudosos-backend)](https://github.com/GEWIS/sudosos-backend)
[![License](https://img.shields.io/github/license/GEWIS/sudosos-backend.svg)](./LICENSE)

</div>

## 🎯 Overview

SudoSOS Backend is a comprehensive Point of Sale (POS) and financial management system designed specifically for Study Association GEWIS. It provides a robust API for managing transactions, user accounts, products, payments, and financial operations within the association.

## 🔧 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 22+** - [Download here](https://nodejs.org/)
- **Git** - [Download here](https://git-scm.com/)
- **OpenSSL** - Usually pre-installed on most systems
- **Database** (choose one):
  - **SQLite** (default for development) - No additional setup required
  - **MariaDB/MySQL** - For production environments
- **SQLite Viewer** (optional) - [DB Browser for SQLite](https://sqlitebrowser.org/) or [DataGrip](https://www.jetbrains.com/datagrip/)

## 🚀 Quick Start

### 1. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/GEWIS/sudosos-backend.git
cd sudosos-backend

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
```

### 2. Generate JWT Key

```bash
# Generate RSA private key for JWT authentication
openssl genrsa -out config/jwt.key 2048
```

Verify the key was created correctly:
```bash
# Should start with -----BEGIN RSA PRIVATE KEY-----
head -1 config/jwt.key
```

### 3. Build and Test

```bash
# Generate swagger specification
npm run swagger

# Build the project
npm run build

# Run tests to verify everything works
npm run test
```

### 4. Initialize Database

> [!WARNING]
> **IMPORTANT: Clear your database before initializing!**
> - For SQLite: Delete the `local.sqlite` file if it exists
> - For MariaDB: Drop all tables in your database

**Quick Start for Development:**
```bash
# For SQLite (recommended for development)
npm run init:schema

```bash
# OR for MariaDB/MySQL
npm run init:migrate
```

This command will:
- Create the database schema
- Seed it with initial data
- Run maintenance tasks
- Set up default roles and permissions

### 5. Start Development Server

```bash
# Start the development server with hot reload
npm run watch
```

The server will be available at `http://localhost:3000`

### 6. Access API Documentation

Visit `http://localhost:3000/api-docs` to access the Swagger UI for API documentation.

### 7. Get Authentication Token

1. Use the `/authentication/mock` endpoint with a valid userId to get a JWT token
2. In Swagger UI, simply enter the JWT token returned by the `/authentication/mock` endpoint
3. Use this token to authenticate API requests

## 🛠️ Development Setup


### Available Scripts

| Script                    | Description                                  |
|---------------------------|----------------------------------------------|
| `npm run build`           | Compile TypeScript to JavaScript             |
| `npm run watch`           | Start development server with hot reload     |
| `npm run test`            | Run all tests                                |
| `npm run test-ci`         | Run tests with schema setup                  |
| `npm run test-ci-migrate` | Run tests with migration setup               |
| `npm run coverage`        | Generate test coverage report                |
| `npm run lint`            | Run ESLint                                   |
| `npm run lint-fix`        | Fix ESLint issues automatically              |
| `npm run schema`          | Create/update database schema (SQLite)       |
| `npm run migrate`         | Run database migrations (MariaDB/MySQL)      |
| `npm run seed`            | Seed database with initial data              |
| `npm run init:schema`     | Complete setup for SQLite development        |
| `npm run init:migrate`    | Complete setup for MariaDB/MySQL development |
| `npm run maintenance`     | Run maintenance tasks                        |
| `npm run cron`            | Start cron job scheduler                     |
| `npm run serve`           | Start production server                      |

## 📁 Project Structure

```
src/
├── authentication/        # JWT token handling and authentication
├── controller/            # API controllers and request/response handling
│   ├── request/           # Request DTOs and validation
│   └── response/          # Response DTOs
├── database/              # Database configuration and migrations
├── entity/                # TypeORM entities and data models
│   ├── authenticator/     # Authentication method entities
│   ├── container/         # Product container entities
│   ├── event/             # Event management entities
│   ├── file/              # File management entities
│   ├── invoices/          # Invoice-related entities
│   ├── point-of-sale/     # POS system entities
│   ├── product/           # Product catalog entities
│   ├── rbac/              # Role-based access control entities
│   ├── stripe/            # Payment processing entities
│   ├── transactions/      # Transaction and financial entities
│   └── user/              # User management entities
├── errors/                # Custom error classes
├── files/                 # File handling utilities
├── gewis/                 # GEWIS-specific integrations
├── helpers/               # Utility functions and helpers
├── mailer/                # Email functionality
├── middleware/            # Express middleware
├── migrations/            # Database migration files
├── rbac/                  # Role-based access control logic
├── server-settings/       # Server configuration management
├── service/               # Business logic services
├── start/                 # Application startup and Swagger setup
├── subscriber/            # Database event subscribers
├── index.ts               # Main application entry point
├── cron.ts                # Scheduled task definitions
└── maintenance.ts         # Development maintenance script
```

## 📚 API Documentation

### Swagger UI
- **Development**: `http://localhost:3000/api-docs`
- **Production**: `https://sudosos.gewis.nl/api/api-docs/`

### Comprehensive Documentation
For detailed documentation, API references, and examples, visit the SudoSOS documentation site [here](http://sudosos.gewis.nl/docs):

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

### Development Workflow
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Run tests: `npm run test`
5. Run linting: `npm run lint-fix`
6. Commit your changes: `git commit -m "feat: Add your feature"` ([follow the conventional commits format](https://www.conventionalcommits.org/en/v1.0.0/))
7. Push to your branch: `git push origin feature/your-feature-name`
8. Create a Pull Request

### IDE Setup (IntelliJ/WebStorm)
For easy ESLint integration:
1. Go to Preferences → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint
2. Check "Run ESLint --fix on save"
3. Apply changes

## 📄 License

This project is licensed under the GNU Affero General Public License v3.0 or later. See the [LICENSE](./LICENSE) file for details.

## 👥 Contributors

This project exists thanks to all the people who contribute code.

<a href="https://github.com/GEWIS/sudosos-backend/graphs/contributors"><img src="https://contributors.aika.dev/GEWIS/sudosos-backend/contributors.svg?max=44" alt="Code contributors" /></a>

---

<div align="center">
  <p>Made with ❤️ by <a href="https://gewis.nl">Study Association GEWIS</a></p>
</div>