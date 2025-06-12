// Interfaces
interface PriceRecord {
  timestamp: string;
  price: number;
}

interface RawData {
  items: {
    [key: string]: PriceRecord[];
  };
}

interface APIResponse {
  result: {
    data: {
      [key: string]: number;
    };
  };
}

// Función para obtener el nombre de la clave semanal
function getWeeklyKey(): string {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Domingo
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Sábado
  
  return `prices_${startOfWeek.toISOString().split('T')[0]}_to_${endOfWeek.toISOString().split('T')[0]}`;
}

// Función para redondear a 2 decimales
const roundToTwo = (num: number): number => {
  return Math.round(num * 100) / 100;
};

// Función para obtener datos de la API
export async function fetchPricesFromAPI(): Promise<RawData> {
  try {
    const response = await fetch('https://api2.warera.io/trpc/itemTrading.getPrices');
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }
    
    const apiData = await response.json() as APIResponse;
    const currentTimestamp = new Date().toISOString();
    
    // Convertir el formato de la API al formato que necesitamos
    const rawData: RawData = {
      items: {}
    };
    
    // Para cada item en la respuesta de la API
    for (const [item, price] of Object.entries(apiData.result.data)) {
      rawData.items[item] = [{
        timestamp: currentTimestamp,
        price: roundToTwo(price)
      }];
    }
    
    return rawData;
  } catch (error) {
    console.error('Error al obtener datos de la API:', error);
    throw error;
  }
}

// Función para cargar datos del localStorage
export async function loadWeeklyPrices(): Promise<RawData> {
  try {
    if (typeof window === 'undefined') {
      return { items: {} };
    }

    const weeklyKey = getWeeklyKey();
    const storedData = localStorage.getItem(weeklyKey);
    
    if (!storedData) {
      return { items: {} };
    }
    
    return JSON.parse(storedData);
  } catch (error) {
    console.error('Error al cargar datos semanales:', error);
    return { items: {} };
  }
}

// Función para guardar datos en localStorage
export async function saveWeeklyPrices(newData: RawData): Promise<void> {
  try {
    if (typeof window === 'undefined') {
      return;
    }

    const weeklyKey = getWeeklyKey();
    const existingData = await loadWeeklyPrices();
    
    // Combinar datos existentes con nuevos datos
    const combinedData: RawData = {
      items: { ...existingData.items }
    };
    
    // Para cada item en los nuevos datos
    for (const [item, newPrices] of Object.entries(newData.items)) {
      if (!combinedData.items[item]) {
        combinedData.items[item] = [];
      }
      
      // Agregar nuevos precios al historial
      combinedData.items[item] = [
        ...combinedData.items[item],
        ...newPrices
      ];
      
      // Ordenar por timestamp
      combinedData.items[item].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    }
    
    // Guardar datos combinados
    localStorage.setItem(weeklyKey, JSON.stringify(combinedData));
  } catch (error) {
    console.error('Error al guardar datos semanales:', error);
  }
}

// Función para actualizar datos cada hora
export async function startPriceUpdates(): Promise<void> {
  try {
    // Obtener datos iniciales
    const data = await fetchPricesFromAPI();
    await saveWeeklyPrices(data);
    
    // Configurar actualización cada hora
    setInterval(async () => {
      try {
        const newData = await fetchPricesFromAPI();
        await saveWeeklyPrices(newData);
        console.log('Datos actualizados:', new Date().toISOString());
      } catch (error) {
        console.error('Error en la actualización automática:', error);
      }
    }, 60 * 60 * 1000); // 1 hora en milisegundos
  } catch (error) {
    console.error('Error al iniciar las actualizaciones:', error);
    throw error;
  }
} 