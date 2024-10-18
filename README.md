<div align="center">

<!-- Centered Logo Image -->
<img src="https://github.com/GEWIS/sudosos-backend/blob/develop/backend_logo.png?raw=true" alt="Logo" style="width:200px;height:auto;">

<!-- Centered Name Beneath Logo -->
<h1>SudoSOS Backend</h1>

[![Build](https://img.shields.io/github/actions/workflow/status/GEWIS/sudosos-backend/release.yml?branch=main&label=Build)](https://github.com/GEWIS/sudosos-backend/actions/workflows/release.yml)
[![Latest Release](https://img.shields.io/github/v/tag/GEWIS/sudosos-backend?label=Latest)](https://github.com/GEWIS/sudosos-backend/releases)
[![Issues](https://img.shields.io/github/issues/GEWIS/sudosos-backend)](https://github.com/GEWIS/sudosos-backend/issues)
[![Commit Activity](https://img.shields.io/github/commit-activity/m/GEWIS/sudosos-backend)](https://github.com/GEWIS/sudosos-backend/commits/develop)
[![Code Size](https://img.shields.io/github/languages/code-size/GEWIS/sudosos-backend)](https://github.com/GEWIS/sudosos-backend)
[![License](https://img.shields.io/github/license/GEWIS/sudosos-backend.svg)](./LICENSE)

</div>

## Quick start
This quick start first states what software needs to be installed to be able to work with the project and then explains how to get the project started.

Prerequisites:
-	Have Node.js installed. Version 18 is required.
     - Note that NPM 14.16 (latest) might not run the coverage on Linux. This is probably a race condition in the package and is being addressed.
- Have Git and possibly a Git manager installed
- Have OpenSSL installed (if you're using Git Bash you already have OpenSSL)
- Have a SQLite viewer installed (optional, you can also set it to be saved in another database, but SQLite is the default). Recommended tools are [DB Browser for SQLite](https://sqlitebrowser.org/) or [DataGrip](https://www.jetbrains.com/datagrip/).

Installing:
- Checkout the Git to your favorite directory
     -- If your path contains spaces you are basically begging for problems, and that is entirely your own fault
- Copy `.env.example` to `.env`
- Run `npm install` in this base directory
- Run `openssl genrsa -out config/jwt.key 2048`
- Check that there exists a jwt.key file in the config directory starting with `-----BEGIN RSA PRIVATE KEY-----`
- Run `npm run swagger`
- Run `npm run build`
- Run `npm run test` - All of these should now pass

Running:
- OR without seed
  - Run `npm run schema`
  - Check that `local.sqlite` exists and open it
  -	Create an entry in the user table (`INSERT INTO "user"(createdAt, updatedAt, version, firstName, lastName, active, deleted, "type") VALUES(datetime('NOW'), datetime('NOW'), 1, 'firstName', 'lastName', 1, 0, 1)`)
  - Remember the userId (probably 1)
- OR with seed
  - Run `npm run seed`


- Run `npm run watch` to start the application in development mode
- Check that http://localhost:3000/api-docs shows a swagger ui
- You can get a JWT key by using `/authentication/mock` using a valid userId.
You can then use this token to for example set a password to log in on the frontend
- **IN SWAGGER UI USE `Bearer <token>` TO GET THINGS TO WORK!!**

## Intellij hints
### Easy ESLint intergration
To make sure ESLint fixes your code on save do the following:
- Have Webstorm version 2020.1 or higher installed
- Go to Preferences - Language and Frameworks - Javascript - Code Quality Tools - Eslint
- check `Run ESLint --fix on save`
- Apply changes and press ok

## Contributors

This project exists thanks to all the people who contribute code.

[//]: # (TODO create a CONTRIBUTING.md)
[//]: # (If you'd like to help, see [our guide to contributing code]&#40;CONTRIBUTING.md&#41;.)
<a href="https://github.com/GEWIS/sudosos-backend/graphs/contributors"><img src="https://contributors.aika.dev/GEWIS/sudosos-backend/contributors.svg?max=44" alt="Code contributors" /></a>
