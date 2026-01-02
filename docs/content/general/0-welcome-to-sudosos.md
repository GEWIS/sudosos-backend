# Welcome to SudoSOS!

This guide introduces SudoSOS, explains the problems it solves, and helps you understand the system at a high level.

::: tip Looking for API Documentation?
For detailed API references and code documentation, visit the **[TypeDoc Documentation](/documentation)** or explore the **[Swagger API](https://sudosos.gewis.nl/api/api-docs/)**.
:::

## What is SudoSOS?

SudoSOS (pronounced "sudo-sos") is a Point of Sale (POS) and financial management system for Study Association GEWIS. The system has an interesting history: it evolved from a physical "schandpaal" (wall of shame) that displayed members with outstanding debts at borrels. The original SOS _(Schandpaal Onderhoud Systeem)_ digitized this concept, followed by SuSOS _(Super Schandpaal Onderhoud Systeem)_, and now SudoSOS.

Today, SudoSOS handles everything from quick drink purchases at borrels to complex financial operations like invoicing, balance management, and payment processing.

## Problems SudoSOS Solves

GEWIS needed a tailored point of sale and financial management system with requirements specific to how the association operates. While many POS solutions exist, a crucial need for GEWIS was seamless integration with the unique structure of the association, using our existing member database, organizational hierarchies, and custom data, rather than forcing our workflows into a generic template. In particular, the system had to:

- Process transactions quickly at borrels and activities
- Enable self-service checkouts where members purchase items independently  
- Track member balances and spending
- Generate invoices for outstanding debts
- Handle deposits and payments
- Provide financial oversight and reporting
- Manage multiple points of sale and product catalogues
- Integrate with external systems for member data and organisational structure
- Seamlessly connect with GEWIS’s existing infrastructure

SudoSOS provides a complete solution for these diverse needs, combining sransaction processing with financial oversight and deep integration with GEWIS’s systems.

## System Components

To deliver this  solution, the SudoSOS ecosystem consists of:

- **Backend API** (this repository) - RESTful API, business logic, database management, and external integrations
- **Frontend Applications** (sudosos-frontend repository) - Dashboard for management and POS interface for self-service checkouts
- **External Integrations** - GEWISDB, LDAP/Active Directory, Stripe payments, and email service

These components work together to provide a complete solution for GEWIS's financial and point-of-sale needs. The backend API handles all business logic and data management, while the frontend applications provide user interfaces for different use cases.

::: tip Looking for Frontend Code?
The frontend applications (Dashboard and POS Interface) are developed in a separate repository: **[sudosos-frontend](https://github.com/GEWIS/sudosos-frontend)**. This documentation covers only the backend API.
:::

<!-- ## Next Steps

Now that you understand what SudoSOS is and the problems it solves, continue to learn how it works:

- **[System Architecture](/architecture)** - Learn how SudoSOS solves these problems through its technical architecture and design patterns
- **[Contributing](/contributing)** - Set up your development environment and make your first contribution
- **[Documentation](/documentation)** - Explore detailed entity references and API specifications

Welcome to the SudoSOS community! 🎉 -->