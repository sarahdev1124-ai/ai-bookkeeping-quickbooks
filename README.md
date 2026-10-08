# AI Bookkeeping & QuickBooks Integration

A full-stack bookkeeping application that uses AI to categorize financial transactions and integrates with QuickBooks Online.

## Overview

This project demonstrates how AI can assist with bookkeeping workflows by automatically categorizing transactions, assigning confidence scores, explaining its reasoning, and supporting human review.

It also demonstrates a QuickBooks Online integration that imports transactions, sends them through the AI categorization workflow, and stores the results in PostgreSQL.

## Features

- AI-powered transaction categorization
- Controlled bookkeeping categories
- AI confidence scoring
- AI-generated categorization reasoning
- Human review and approval workflow
- Client-specific transaction data
- QuickBooks Online OAuth integration
- QuickBooks transaction import
- QuickBooks + AI categorization workflow
- PostgreSQL data persistence
- React dashboard interface

## AI Workflows

### Existing Transactions

Transactions already stored in the application can be sent through the AI categorization workflow.

**Transactions → AI → Category + Confidence + Reason**

### QuickBooks Integration

Transactions can be imported from QuickBooks Online and categorized as part of the same workflow.

**QuickBooks → Import → AI Categorization → PostgreSQL → Dashboard**

## Technology Stack

**Frontend**
- React
- Vite
- JavaScript
- CSS

**Backend**
- Node.js
- Express

**Database**
- PostgreSQL

**Integrations & AI**
- QuickBooks Online API
- QuickBooks OAuth
- OpenAI API

**Development Tools**
- VS Code
- Git
- GitHub
- Postico

## Project Structure

```text
bookkeeping-app/
├── frontend/
│   ├── src/
│   ├── index.html
│   └── vite.config.js
├── routes/
├── app.js
├── db.js
├── package.json
├── package-lock.json
└── README.md

## Status

This is an actively developed portfolio project. Planned future enhancements include deployment, authentication, additional reporting features, and further AI automation.

## Security

API keys, database credentials, and other environment-specific secrets are stored in local environment variables and are not committed to the repository.