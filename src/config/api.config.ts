export const API_CONFIG = {
  baseUrl: 'https://api2.warera.io/trpc/itemTrading.getPrices',
  updateInterval: 60 * 1000, // Cambiado a 1 minuto para pruebas
  maxRetries: 3,
  retryDelay: 5000, // 5 segundos
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}; 