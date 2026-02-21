# Credit Card Processing ARR Calculator

An AI-powered web application that analyzes credit card processing statements and calculates annual recurring revenue (ARR) for sales representatives.

## Features

- 📄 **AI Document Analysis** - Upload processing statements and let Gemini AI extract key data
- 💳 **Card Breakdown** - Automatically identifies Visa, Mastercard, Amex, and Discover volumes
- 💰 **4 Pricing Models** - Calculate ARR using:
  - Interchange Plus
  - Flat Rate
  - Tiered Pricing
  - Dual Pricing
- 📊 **Profit Analysis** - See your revenue minus interchange costs
- 🎯 **ARR Calculation** - Instant annual recurring revenue projections
- 💾 **Cloud Database** - Save and track analyses with Neon PostgreSQL

## Tech Stack

- **Framework:** Next.js 14 with TypeScript
- **AI:** Google Gemini 1.5 Flash (Vision API)
- **Styling:** Tailwind CSS
- **Database:** Neon (Serverless PostgreSQL)
- **ORM:** Drizzle ORM
- **Deployment:** Vercel

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A Neon account ([neon.tech](https://neon.tech))
- A Google AI account for Gemini API ([ai.google.dev](https://ai.google.dev))
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

3. **Set up environment variables:**
   - Create a `.env` file:
     ```bash
     cp .env.example .env
     ```
   - Add your credentials:
     ```
     DATABASE_URL=postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
     GEMINI_API_KEY=your_gemini_api_key_here
     ```

4. **Run database migrations:**
   ```bash
   node migrate.js
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## How to Use

1. **Upload a Statement** - Click "Choose File" and select a credit card processing statement (image or PDF)
2. **Analyze** - Click "Analyze" to let Gemini AI extract the data
3. **Review Analysis** - Check the extracted volumes, interchange fees, and card breakdown
4. **Choose Pricing Model** - Select from Interchange Plus, Flat Rate, Tiered, or Dual Pricing
5. **Enter Your Rates** - Input the rates you plan to charge the merchant
6. **View ARR** - See your projected monthly profit and annual recurring revenue

## Environment Variables

Create a `.env` file with:

```bash
DATABASE_URL=your_neon_database_connection_string
GEMINI_API_KEY=your_google_gemini_api_key
```

**For Vercel deployment**, add both variables in project settings.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT
