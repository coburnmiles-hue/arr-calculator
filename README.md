# ARR Calculator

A modern web application for calculating and tracking Annual Recurring Revenue (ARR) metrics for SaaS businesses.

## Tech Stack

- **Framework:** Next.js 14 with TypeScript
- **Styling:** Tailwind CSS
- **Database:** Neon (Serverless PostgreSQL)
- **ORM:** Drizzle ORM
- **Deployment:** Vercel

## Features

- Calculate ARR, MRR, and ARPU
- Store calculation history in Neon database
- Responsive design with dark mode support
- Real-time calculations

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A Neon account ([neon.tech](https://neon.tech))
- A GitHub account
- A Vercel account ([vercel.com](https://vercel.com))

### Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd arr-calculator
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up your Neon database:**
   - Create a new project at [neon.tech](https://neon.tech)
   - Copy your database connection string
   - Create a `.env` file:
     ```bash
     cp .env.example .env
     ```
   - Add your Neon database URL to `.env`:
     ```
     DATABASE_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
     ```

4. **Generate and run database migrations:**
   ```bash
   npm run db:generate
   npm run db:push
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Database Commands

- `npm run db:generate` - Generate migration files
- `npm run db:push` - Push schema changes to database
- `npm run db:studio` - Open Drizzle Studio for database management

## Deployment to Vercel

### Option 1: Deploy via Vercel Dashboard

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and sign in
3. Click "New Project"
4. Import your GitHub repository
5. Add your environment variable:
   - `DATABASE_URL` = your Neon connection string
6. Click "Deploy"

### Option 2: Deploy via Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy:
   ```bash
   vercel
   ```

4. Add environment variables in Vercel dashboard or via CLI:
   ```bash
   vercel env add DATABASE_URL
   ```

## Project Structure

```
arr-calculator/
├── app/
│   ├── api/
│   │   └── calculations/
│   │       └── route.ts          # API endpoints for calculations
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home page
├── components/
│   └── ARRCalculator.tsx         # Main calculator component
├── lib/
│   ├── db.ts                     # Database connection
│   └── schema.ts                 # Database schema
├── .env.example                  # Environment variables template
├── drizzle.config.ts             # Drizzle ORM configuration
├── next.config.js                # Next.js configuration
├── package.json                  # Dependencies and scripts
├── tailwind.config.js            # Tailwind CSS configuration
└── tsconfig.json                 # TypeScript configuration
```

## Environment Variables

Create a `.env` file with the following variables:

```bash
DATABASE_URL=your_neon_database_connection_string
```

Remember to add the same environment variables in your Vercel project settings.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT
