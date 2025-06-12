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

// Función para redondear a 2 decimales
const roundToTwo = (num: number): number => {
  return Math.round(num * 100) / 100;
};

// Función para obtener la lista de archivos JSON disponibles
export async function getAvailableFiles(): Promise<string[]> {
  try {
    const response = await fetch('/api/files');
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error al obtener lista de archivos:', error);
    return [];
  }
}

// Función para cargar datos de un archivo JSON específico
export async function loadPricesFromFile(filename: string): Promise<RawData> {
  try {
    const response = await fetch(`/data/${filename}`);
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error al cargar datos del archivo ${filename}:`, error);
    throw error;
  }
}

// Función para cargar datos de múltiples archivos
export async function loadMultipleFiles(filenames: string[]): Promise<RawData> {
  try {
    const allData: RawData = { items: {} };
    
    for (const filename of filenames) {
      const fileData = await loadPricesFromFile(filename);
      
      // Combinar datos de cada archivo
      for (const [item, prices] of Object.entries(fileData.items)) {
        if (!allData.items[item]) {
          allData.items[item] = [];
        }
        allData.items[item] = [...allData.items[item], ...prices];
      }
    }
    
    // Ordenar todos los precios por timestamp
    for (const item in allData.items) {
      allData.items[item].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    }
    
    return allData;
  } catch (error) {
    console.error('Error al cargar múltiples archivos:', error);
    throw error;
  }
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

// Función para obtener datos de la API
export async function fetchPricesFromAPI(): Promise<RawData> {
  try {
    const response = await fetch('/api/prices');
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }
    const data = await response.json() as RawData;
    
    // Procesar y redondear los precios
    const processedData: RawData = { items: {} };
    for (const [item, prices] of Object.entries(data.items)) {
      processedData.items[item] = prices.map((record: PriceRecord) => ({
        ...record,
        price: roundToTwo(record.price)
      }));
    }
    
    return processedData;
  } catch (error) {
    console.error('Error al obtener datos de la API:', error);
    throw error;
  }
}

// Función para cargar datos semanales
export async function loadWeeklyPrices(): Promise<RawData> {
  try {
    const weeklyFile = getWeeklyFileName();
    return await loadPricesFromFile(weeklyFile);
  } catch (error) {
    console.error('Error al cargar datos semanales:', error);
    throw error;
  }
} 