export const API_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api2.warera.io/trpc/itemTrading.getPrices',
  endpoints: {
    prices: '/prices',
  },
  updateInterval: 60 * 60 * 1000, // 1 hora en milisegundos
  maxRetries: 3,
  retryDelay: 5000, // 5 segundos
}; 