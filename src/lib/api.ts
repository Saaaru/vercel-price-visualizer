import fs from 'fs';
import path from 'path';

// Estructura de datos para almacenar los precios
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

// Función para obtener el nombre del archivo semanal
function getWeeklyFileName(): string {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Domingo
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Sábado
  
  return `prices_${startOfWeek.toISOString().split('T')[0]}_to_${endOfWeek.toISOString().split('T')[0]}.json`;
}

// Función para redondear a 2 decimales
const roundToTwo = (num: number): number => {
  // Primero multiplicamos por 100 para mover el punto decimal
  // Luego usamos Math.round para redondear al entero más cercano
  // Finalmente dividimos por 100 para volver a la posición original
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

// Función para cargar datos del archivo semanal
export async function loadWeeklyPrices(): Promise<RawData> {
  try {
    const weeklyFileName = getWeeklyFileName();
    const filePath = path.join(process.cwd(), 'public', 'weekly_data', weeklyFileName);
    
    // Crear directorio si no existe
    const dirPath = path.join(process.cwd(), 'public', 'weekly_data');
    if (!fs.existsSync(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
    
    // Si el archivo no existe, crear uno nuevo
    if (!fs.existsSync(filePath)) {
      return { items: {} };
    }
    
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('Error al cargar datos semanales:', error);
    throw error;
  }
}

// Función para guardar datos en el archivo semanal
export async function saveWeeklyPrices(newData: RawData): Promise<void> {
  try {
    const weeklyFileName = getWeeklyFileName();
    const filePath = path.join(process.cwd(), 'public', 'weekly_data', weeklyFileName);
    
    // Cargar datos existentes
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
    await fs.promises.writeFile(filePath, JSON.stringify(combinedData, null, 2));
  } catch (error) {
    console.error('Error al guardar datos semanales:', error);
    throw error;
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