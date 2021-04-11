# Welcome to SudoSOS
Hi welcome to SudoSOS. To get you quickly started follow the install steps below.

## Quick start
This quick start first states what software needs to be installed to be able to work with the project and then explains how to get the project started.

Prerequisites:
-	Have NPM installed
     - Note that NPM 14.16 (latest) might not run the coverage on Linux. This is probably a race condition in the package and is being addressed.
- Have OpenSSL installed
- Have Git and possibly a Git manager installed
- Have a SQLite viewer installed (optional, you can also set it to be saved in another database, but SQLite is the default)

Installing:
-	Checkout the Git to your favorite directory
     -- If your path contains spaces you are basically begging for problems, and that is entirely your own fault
- Run `npm install` in this base directory
- Run `openssl genrsa -out config/jwt.key 2048`
- Check that there exists a jwt.key file in the config directory starting with `-----BEGIN RSA PRIVATE KEY-----`
- Run `npm run swagger`
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
- You can get a JWT key by using `/authentication/mock` using a valid userId

## Intellij hints
### Easy ESLint intergration
To make sure ESLint fixes your code on save do the following:
- Have Webstorm version 2020.1 or higher installed
- Go to Preferences - Language and Frameworks - Javascript - Code Quality Tools - Eslint
- check `Run ESLint --fix on save`
- Apply changes and press ok
