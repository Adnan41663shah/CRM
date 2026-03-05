# CRM - Customer Relationship Management System

A full-stack CRM application for managing inquiries, follow-ups, conversions, and admissions. Built with React, Node.js, Express, MongoDB, and Socket.IO for real-time updates.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [User Roles](#user-roles)
- [API Overview](#api-overview)
- [Real-Time Features](#real-time-features)
- [Theme & Styling](#theme--styling)
- [Scripts](#scripts)

---

## Overview

This CRM helps organizations manage the full customer journey—from initial inquiry through presales, sales, conversion, and admission. It supports three user roles (Presales, Sales, Admin) with role-based access control, center/location-based filtering, and real-time collaboration.

---

## Features

### Authentication
- **Login** – Email/password authentication (dev and production)
- **Register** – Self-registration with Presales or Sales role (Admin cannot be registered; created via Users management)
- **JWT** – Session tokens with httpOnly cookies for security
- **Theme** – Light and dark mode support

### Presales
- View all inquiries
- Create and manage inquiries
- Add follow-ups (call, email, WhatsApp)
- Track lead stages (Cold, Warm, Hot, Not Interested, Walkin, Online-Conversion)
- Forward inquiries to Sales
- Center-based inquiry management
- My Follow-Ups and My Raised Inquiries views

### Sales
- View assigned inquiries
- Manage sales pipeline
- Track follow-ups and outcomes
- Mark conversions and admissions
- Center-based dashboard and inquiries
- My Inquiries and My Follow-Ups views

### Admin
- **Dashboard** – Overview, data tab, funnel analytics
- **Presales Inquiries** – All presales inquiries
- **Sales Inquiries** – All sales inquiries
- **User Management** – Create, edit, activate/deactivate users; manage roles and center permissions
- **Option Settings** – Configure courses, locations, mediums, lead stages
- **Reports** – Presales and Sales reports
- **Admissions** – Admitted students tracking
- **Conversions** – Conversion funnel
- Center-based dashboards and inquiries

### General
- **Global search** (Ctrl+K) – Search inquiries by name, email, or phone
- **Real-time updates** – Socket.IO for live dashboard and inquiry changes
- **WhatsApp integration** – Quick contact via WhatsApp
- **CSV/Excel export** – Export inquiry and report data
- **Responsive UI** – Mobile-friendly layout with collapsible sidebar

---

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite 7 | Build tool and dev server |
| React Router 6 | Routing |
| React Query | Server state & caching |
| Tailwind CSS 4 | Styling |
| Framer Motion | Animations |
| Recharts | Charts and analytics |
| Axios | HTTP client |
| Socket.IO Client | Real-time updates |
| React Hook Form | Form handling |
| React Toastify | Notifications |
| Lucide React | Icons |

### Backend
| Technology | Purpose |
|------------|---------|
| Node.js | Runtime |
| Express 4 | Web framework |
| TypeScript | Type safety |
| MongoDB + Mongoose | Database |
| Socket.IO | Real-time events |
| JWT | Authentication |
| bcryptjs | Password hashing |
| express-validator | Request validation |
| Helmet | Security headers |
| Winston | Logging |
| ExcelJS | Excel export |
| Multer | File uploads |

---

## Project Structure

```
crm-personal/
├── frontend/                 # React SPA
│   ├── public/               # Static assets
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── Layout.tsx
│   │   │   ├── Navbar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── CreateInquiryModal.tsx
│   │   │   ├── Pagination.tsx
│   │   │   └── ...
│   │   ├── contexts/         # React contexts
│   │   │   ├── AuthContext.tsx
│   │   │   ├── ThemeContext.tsx
│   │   │   └── SocketContext.tsx
│   │   ├── pages/            # Page components
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Inquiries.tsx
│   │   │   ├── InquiryDetails.tsx
│   │   │   └── ...
│   │   ├── services/         # API service
│   │   │   └── api.ts
│   │   ├── types/            # TypeScript types
│   │   ├── hooks/            # Custom hooks
│   │   ├── utils/            # Utilities
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css         # Global styles, Tailwind theme
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── backend/                  # Express API
│   ├── src/
│   │   ├── config/           # Database config
│   │   ├── controllers/      # Route handlers
│   │   │   ├── authController.ts
│   │   │   ├── inquiryController.ts
│   │   │   ├── userController.ts
│   │   │   └── ...
│   │   ├── helpers/          # Aggregation, utilities
│   │   ├── middleware/       # Auth, validation, error handling
│   │   ├── models/           # Mongoose models
│   │   │   ├── User.ts
│   │   │   ├── Inquiry.ts
│   │   │   ├── Activity.ts
│   │   │   ├── Student.ts
│   │   │   └── OptionSettings.ts
│   │   ├── routes/           # API routes
│   │   │   ├── auth.ts
│   │   │   ├── inquiry.ts
│   │   │   ├── user.ts
│   │   │   └── ...
│   │   ├── services/         # Socket.IO service
│   │   ├── types/            # TypeScript types
│   │   ├── utils/            # JWT, logger, etc.
│   │   └── server.ts
│   ├── package.json
│   └── tsconfig.json
│
└── README.md
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+ (recommended: 20+)
- **MongoDB** 6+ (local or Atlas)
- **npm** or **yarn**

### 1. Clone the repository

```bash
git clone https://github.com/Adnan41663shah/CRM.git
cd crm-personal
```

### 2. Backend setup

```bash
cd backend
npm install
```

Create a `.env` file in the `backend` folder (see [Environment Variables](#environment-variables)).

```bash
npm run dev
```

Backend runs at `http://localhost:5000`.

### 3. Frontend setup

```bash
cd frontend
npm install
```

Create a `.env` file in the `frontend` folder:

```
VITE_API_URL=http://localhost:5000/api
```

For development, the Vite proxy forwards `/api` to the backend, so `VITE_API_URL` can be left empty or set to `/api`.

```bash
npm run dev
```

Frontend runs at `http://localhost:3000`.

### 4. Create the first admin

1. Register a user via `/register` (Presales or Sales only).
2. Promote that user to admin via MongoDB or a seed script, or add an admin-creation script if needed.

Admin accounts cannot be created through the public register form.

---

## Environment Variables

### Backend (`.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | `development` or `production` | `development` |
| `PORT` | Server port | `5000` |
| `MONGODB_URI` | MongoDB connection string | — |
| `JWT_SECRET` | Secret for signing JWTs | — |
| `JWT_EXPIRE` | Token expiry (e.g. `3d`, `24h`) | `3d` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:3000` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window (ms) | `60000` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `300` |
| `AUTH_RATE_LIMIT_MAX` | Max auth attempts per window | `20` |

### Frontend (`.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `/api` (dev proxy) |

---

## User Roles

| Role | Description | Access |
|------|-------------|--------|
| **Presales** | Handle initial inquiries | All Inquiries, My Follow-Ups, My Raised Inquiries, Centers |
| **Sales** | Handle assigned leads | Sales Assigned, My Inquiries, My Follow-Ups, Centers, Conversions, Admissions |
| **Admin** | Full system access | All features, User Management, Option Settings, Reports |

- **Center permissions**: Sales users can be restricted to specific centers (locations).
- **Admin creation**: Admins are created via the Users management page by existing admins, not via public registration.

---

## API Overview

| Base Path | Description |
|-----------|-------------|
| `/api/auth` | Login, register, logout, profile |
| `/api/inquiries` | CRUD, assign, forward, follow-ups, activities |
| `/api/users` | User CRUD, toggle status (admin) |
| `/api/options` | Course, location, medium, lead stage settings |
| `/api/students` | Admitted students |
| `/api/integrations` | Integration endpoints (placeholder) |
| `/` | Health check |

Auth-protected routes use a JWT in an httpOnly cookie or `Authorization: Bearer <token>`.

---

## Real-Time Features

Socket.IO is used for:

- New inquiry notifications
- Inquiry assignment and status updates
- Follow-up updates
- Dashboard stat refreshes

Events are scoped by user role and permissions.

---

## Theme & Styling

- **Primary**: Indigo (#4F46E5)
- **Dark mode**: Toggle in sidebar; persisted in `localStorage`
- **Tailwind CSS 4** with custom theme variables in `index.css`
- **Lexend Deca** font

---

## Scripts

### Backend

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with nodemon |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled server |
| `npm run clean-db` | Reset database (see `clean-db.js`) |

### Frontend

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

---

## License

Private project. All rights reserved.
