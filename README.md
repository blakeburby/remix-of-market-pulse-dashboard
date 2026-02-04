# Dome Markets Dashboard

A real-time prediction markets dashboard displaying data from **Polymarket** and **Kalshi** via the [Dome API](https://domeapi.io).

## Features

- **Multi-Platform Support**: View markets from both Polymarket and Kalshi in a unified interface
- **Real-Time Prices**: Continuous price polling with configurable rate limiting
- **Full Market Discovery**: Automatically paginates through all open markets
- **Smart Rate Limiting**: Token bucket algorithm respects Dome API tier limits
- **Secure Authentication**: API key stored in session storage, never exposed to client requests
- **Responsive Design**: Works on desktop and mobile devices

## How It Works

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   React App     │────▶│   Dome REST API  │────▶│   Polymarket    │
│   (Frontend)    │     │   api.domeapi.io │     │   Kalshi        │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Data Flow

1. **Login**: User enters their Dome API key, which is validated against the API
2. **Discovery Loop**: Automatically fetches all open markets from both platforms using pagination
3. **Price Updates**: Continuously polls token prices for Polymarket markets
4. **Display**: Markets are shown in a sortable, filterable table with real-time updates

### Key Components

- **AuthContext**: Manages API key authentication and tier settings
- **MarketsContext**: Handles market discovery, storage, and price updates
- **RateLimiter**: Token bucket implementation for API rate limiting

## Running Locally

1. Clone the repository
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev`
4. Open http://localhost:5173
5. Enter your Dome API key to connect

## API Tier Limits

| Tier       | Queries/Second | Queries/10 Seconds |
|------------|----------------|-------------------|
| Free       | 1              | 10                |
| Dev        | 100            | 500               |
| Enterprise | Custom         | Custom            |

The dashboard automatically adjusts request rates based on your selected tier.

## WebSocket vs Polling

Currently, the dashboard uses **polling** for price updates because:

- WebSocket subscriptions on Free tier are limited (2 subscriptions, 5 wallets each)
- Polling allows tracking all markets regardless of tier
- The rate limiter ensures we stay within API limits

For higher-volume use cases, WebSocket support can be added for Dev tier users.

## Troubleshooting

### 401 Unauthorized
- Your API key is invalid or expired
- Get a new key from [domeapi.io](https://domeapi.io)

### 429 Rate Limited
- You're making too many requests
- Lower your tier setting or wait for the rate limiter to recover
- The app will automatically back off and retry

### Markets Not Loading
- Check your network connection
- Verify your API key is valid
- Check the Settings panel for error messages

### WebSocket Disconnected
- The app will automatically fall back to polling
- Price updates will continue via REST API calls

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development
- **Tailwind CSS** with custom design system
- **shadcn/ui** components
- **React Router** for navigation
- **date-fns** for date formatting

---

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

**Use your preferred IDE**

Clone this repo and push changes. The only requirement is having Node.js & npm installed.

```sh
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
npm i
npm run dev
```

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

Testing Git push
