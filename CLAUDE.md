# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is VOOI Bot - an automated trading bot for HyperLiquid points farming. It's a React-based frontend application that integrates with HyperLiquid's decentralized exchange for automated trading strategies to maximize VOOI points accumulation.

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Lint code
npm run lint

# Preview production build
npm run preview
```

## Architecture & Key Components

### Core Application Structure
- **Entry Point**: `src/main.tsx` → `src/App.tsx` → `src/VooiBot.tsx`
- **Main Trading Logic**: `src/VooiBot.tsx` - Contains the core bot functionality, position management, and trading loops
- **Wallet Integration**: Uses RainbowKit + Wagmi for Web3 wallet connections on Arbitrum network

### Key Technologies
- **Frontend**: React 19 + TypeScript + Vite
- **Web3**: Wagmi v2 + RainbowKit + Viem for Ethereum/Arbitrum interactions  
- **Trading**: @nktkas/hyperliquid for HyperLiquid API integration
- **Math**: decimal.js-light for precise financial calculations
- **Styling**: CSS Modules (`.module.css` files)

### Core Trading Flow
1. **Wallet Connection**: RainbowKit integration for Web3 wallet auth
2. **Account Setup**: Creates HyperLiquid API wallet via `registerAccount()`
3. **Position Management**: `openPosition()` → `closePosition()` cycle in trading loop
4. **Leverage Control**: Dynamic leverage updates via `updateLeverage()`
5. **Price Calculations**: Uses mark prices with configurable slippage

### Helper Functions Organization
All trading logic is modularized in `src/helpers/`:
- `createOrder.ts` - Order placement with HyperLiquid API
- `registerAccount.ts` - New trading account setup  
- `updateLeverage.ts` - Leverage adjustments
- `approveBuilderFee.ts` - VOOI fee management
- `hyperliquidApi.ts` - Core API client
- `getHyperliquidMarkPriceWithSlippage.ts` - Price calculations with slippage

### Configuration
- `src/config.ts` - HyperLiquid API config, builder fees (1.5 BPS), Arbitrum chain setup
- Uses VOOI builder ID: `0xBe622F92438AE55B12908B01eEACe15d98eD1EEC`
- Default slippage calculations and fee structures

### State Management
- Local React state in `VooiBot.tsx` - no external state management library
- Key state: `agent` (trading account), `selectedAsset`, `leverage`, `margin`, trading loop control
- Real-time data fetching via HyperLiquid InfoClient

### Path Aliases
- `~/` maps to `src/` directory (configured in tsconfig.json)

## Important Notes

### Trading Bot Behavior
- Automated trading loop: opens position → closes position → repeats every 2 seconds
- Supports 15+ major perpetual contracts (BTC, ETH, SOL, etc.)
- Leverage range: 1x to 100x (asset-dependent)
- Default margin management with balance protection

### Security Considerations  
- Uses isolated API wallets (separate from main wallet)
- Private keys never leave browser
- All sensitive operations go through Web3 wallet signatures
- Builder fee approvals are transparent and user-controlled

### Development Tips
- Bot requires connection to Arbitrum network
- Test with small positions first - this handles real money
- Monitor `logs` state array for debugging trading operations
- Position management uses `isLooping` and `isIterationStarted` refs for state control