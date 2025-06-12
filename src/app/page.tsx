// src/app/page.js

"use client"; // ¡Importante! Esto le dice a Next.js que es un componente de cliente

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { fetchPricesFromAPI, loadWeeklyPrices } from '@/lib/api';
import { API_CONFIG } from '@/config/api.config';

// Interfaces y tipos
interface PriceRecord {
  timestamp: string;
  price: number;
}

interface FlatDataItem {
  item: string;
  timestamp: Date;
  price: number;
  hour: number;
  day: string;
}

interface RawData {
  items: {
    [key: string]: PriceRecord[];
  };
}

// Agregar tipos para las estadísticas diarias
interface DailyStats {
  day: string;
  avg: number;
  min: number;
  max: number;
  std: number;
  count: number;
}

// Agregar tipos para el rango de precios
interface PriceRange {
  min: number;
  max: number;
  avg: number;
}

// Agregar tipos para los datos del mapa de calor
interface HeatmapData {
  x: number[];
  y: string[];
  z: (number | null)[][];
  text: string[][];
}

// Interfaces para Plot
interface PlotData {
  x: any[];
  y?: any[];
  z?: (number | null)[][];
  type: string;
  mode?: string;
  name?: string;
  colorscale?: string;
  reversescale?: boolean;
  open?: number[];
  high?: number[];
  low?: number[];
  close?: number[];
  increasing?: {line: {color: string}};
  decreasing?: {line: {color: string}};
  fill?: string;
  fillcolor?: string;
  line?: {color: string; width?: number};
  marker?: {size?: number; color?: string; opacity?: number};
  showlegend?: boolean;
  text?: (string | number)[][] | (string | number)[];
  texttemplate?: string;
  textfont?: {size: number};
  hovertemplate?: string;
  yaxis?: string;
}

interface PlotProps {
  data: PlotData[];
  layout: {
    title: string | { text: string; font?: { color: string; size: number } };
    xaxis: { 
      title: string | { text: string; font?: { color: string } };
      type?: string;
      gridcolor?: string;
      tickfont?: { color: string };
    };
    yaxis?: { 
      title: string | { text: string; font?: { color: string } };
      gridcolor?: string;
      tickfont?: { color: string };
    };
    yaxis2?: { 
      title: string | { text: string; font?: { color: string } };
      overlaying: string;
      side: string;
      gridcolor?: string;
      tickfont?: { color: string };
    };
    height: number;
    autosize: boolean;
    showlegend?: boolean;
    hovermode?: string;
    plot_bgcolor?: string;
    paper_bgcolor?: string;
    font?: { color: string };
    legend?: {
      font?: { color: string };
      bgcolor?: string;
      bordercolor?: string;
      borderwidth?: number;
    };
  };
  useResizeHandler: boolean;
  style: { width: string; height: string };
  config?: any;
}

// Carga dinámica de Plotly para que no afecte la carga inicial de la página
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false }) as React.ComponentType<PlotProps>;

// --- Funciones de Ayuda para el Procesamiento de Datos ---

// Función para calcular la desviación estándar (nuestra medida de volatilidad)
const getStandardDeviation = (array: number[]): number => {
  if (!array || array.length === 0) return 0;
  try {
    const n = array.length;
    const mean = array.reduce((a: number, b: number) => a + b) / n;
    return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a: number, b: number) => a + b) / n);
  } catch (error) {
    console.error('Error al calcular la desviación estándar:', error);
    return 0;
  }
};

// Función para calcular media móvil
const getMovingAverage = (data: number[], windowSize: number): number[] => {
  if (!data || data.length === 0 || windowSize <= 0) return [];
  try {
    const result = [];
    for (let i = windowSize - 1; i < data.length; i++) {
      const window = data.slice(i - windowSize + 1, i + 1);
      const avg = window.reduce((a, b) => a + b) / windowSize;
      result.push(avg);
    }
    return result;
  } catch (error) {
    console.error('Error al calcular la media móvil:', error);
    return [];
  }
};

// Función para obtener estadísticas por día
const getDailyStats = (data: FlatDataItem[]): DailyStats[] => {
  if (!data || data.length === 0) return [];
  try {
    const dailyGroups = data.reduce((acc, item) => {
      if (!acc[item.day]) acc[item.day] = [];
      acc[item.day].push(item.price);
      return acc;
    }, {} as Record<string, number[]>);

    return Object.entries(dailyGroups).map(([day, prices]) => ({
      day,
      avg: prices.reduce((a, b) => a + b) / prices.length,
      min: Math.min(...prices),
      max: Math.max(...prices),
      std: getStandardDeviation(prices),
      count: prices.length
    }));
  } catch (error) {
    console.error('Error al calcular estadísticas diarias:', error);
    return [];
  }
};

// Función para normalizar datos (0-100)
const normalizeData = (data: number[]): number[] => {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  if (range === 0) return data.map(() => 50); // Si todos los valores son iguales
  return data.map(value => ((value - min) / range) * 100);
};

// Función para calcular el rango de precios de un item
const getPriceRange = (data: FlatDataItem[], item: string) => {
  const prices = data.filter(d => d.item === item).map(d => d.price);
  if (prices.length === 0) return { min: 0, max: 0, avg: 0 };
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: prices.reduce((a, b) => a + b) / prices.length
  };
};

// Colores para los gráficos
const CHART_COLORS = [
  '#00d4ff', '#6366f1', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#ec4899'
];

export default function HomePage() {
  // --- Estados de la Aplicación ---
  const [rawData, setRawData] = useState<FlatDataItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState('cocain'); // Item por defecto
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [selectedItem2, setSelectedItem2] = useState<string>('');
  const [selectedItemsForTrends, setSelectedItemsForTrends] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<[number, number]>([0, 23]);
  const [dateRange, setDateRange] = useState<string>('single'); // 'single', 'range', 'all'
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [trendAnalysisType, setTrendAnalysisType] = useState<string>('daily'); // 'daily', 'hourly'
  const [yAxisMode, setYAxisMode] = useState<string>('linear'); // 'linear', 'log', 'dual', 'normalized'
  const [currentPrices, setCurrentPrices] = useState<{[key: string]: number}>({});

  // --- Carga de Datos ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Obtener precios actuales
        const currentData = await fetchPricesFromAPI();
        if (currentData && currentData.items) {
          const prices: {[key: string]: number} = {};
          for (const [item, records] of Object.entries(currentData.items)) {
            if (records.length > 0) {
              prices[item] = records[0].price;
            }
          }
          setCurrentPrices(prices);
        }
        
        let data: RawData;
        try {
          data = await loadWeeklyPrices();
        } catch (error) {
          console.warn('No se encontraron datos semanales, obteniendo de la API:', error);
          data = await fetchPricesFromAPI();
        }
        
        if (!data || !data.items) {
          throw new Error('Datos inválidos recibidos de la API');
        }
        
        const flatData: FlatDataItem[] = [];
        for (const [itemName, priceHistory] of Object.entries(data.items)) {
          if (!Array.isArray(priceHistory)) {
            console.warn(`Historial de precios inválido para ${itemName}`);
            continue;
          }
          
          priceHistory.forEach((record: PriceRecord) => {
            try {
              const date = new Date(record.timestamp);
              if (isNaN(date.getTime())) {
                throw new Error(`Timestamp inválido: ${record.timestamp}`);
              }
              
              flatData.push({
                item: itemName,
                timestamp: date,
                price: Number(record.price),
                hour: date.getUTCHours(),
                day: date.toISOString().split('T')[0]
              });
            } catch (error) {
              console.error(`Error procesando registro para ${itemName}:`, error);
            }
          });
        }
        
        if (flatData.length === 0) {
          throw new Error('No se encontraron datos válidos para procesar');
        }
        
        flatData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        setRawData(flatData);
        
        const days = [...new Set(flatData.map(d => d.day))].sort();
        if (days.length > 0) {
          setSelectedDay(days[0]);
          setStartDate(days[0]);
          setEndDate(days[days.length - 1]);
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Error desconocido al cargar datos';
        setError(errorMessage);
        console.error('Error en fetchData:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Modificar el intervalo de actualización para incluir precios actuales
    const updateInterval = setInterval(async () => {
      try {
        const newData = await fetchPricesFromAPI();
        if (newData && newData.items) {
          const prices: {[key: string]: number} = {};
          for (const [item, records] of Object.entries(newData.items)) {
            if (records.length > 0) {
              prices[item] = records[0].price;
            }
          }
          setCurrentPrices(prices);
        }
        
        if (!newData || !newData.items) {
          throw new Error('Datos inválidos recibidos de la API');
        }

        const flatData: FlatDataItem[] = [];
        for (const [itemName, priceHistory] of Object.entries(newData.items)) {
          if (!Array.isArray(priceHistory)) continue;
          
          priceHistory.forEach((record: PriceRecord) => {
            try {
              const date = new Date(record.timestamp);
              if (isNaN(date.getTime())) return;
              
              flatData.push({
                item: itemName,
                timestamp: date,
                price: Number(record.price),
                hour: date.getUTCHours(),
                day: date.toISOString().split('T')[0]
              });
            } catch (error) {
              console.error(`Error procesando actualización para ${itemName}:`, error);
            }
          });
        }

        if (flatData.length > 0) {
          flatData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          setRawData(flatData);
        }
      } catch (error) {
        console.error('Error en la actualización automática:', error);
      }
    }, API_CONFIG.updateInterval);

    return () => clearInterval(updateInterval);
  }, []);

  // --- Función para filtrar datos por rango de fechas ---
  const getFilteredDataByDateRange = useMemo(() => {
    if (!rawData) return [];
    
    switch (dateRange) {
      case 'single':
        return rawData.filter(d => d.day === selectedDay);
      case 'range':
        return rawData.filter(d => d.day >= startDate && d.day <= endDate);
      case 'all':
        return rawData;
      default:
        return rawData.filter(d => d.day === selectedDay);
    }
  }, [rawData, dateRange, selectedDay, startDate, endDate]);

  // --- 1. Gráfico de Evolución de Precios Mejorado ---
  const priceEvolutionData = useMemo(() => {
    const filteredData = getFilteredDataByDateRange;
    if (filteredData.length === 0) return [];
    
    const data: PlotData[] = [];
    
    // Datos del primer item
    const filteredData1 = filteredData.filter(d => d.item === selectedItem);
    // Datos del segundo item si está seleccionado
    const filteredData2 = selectedItem2 ? filteredData.filter(d => d.item === selectedItem2) : [];
    
    if (filteredData1.length === 0 && filteredData2.length === 0) return [];

    // Obtener rangos de precios para mostrar información
    const range1 = getPriceRange(filteredData1, selectedItem);
    const range2 = selectedItem2 ? getPriceRange(filteredData2, selectedItem2) : null;

    if (yAxisMode === 'normalized') {
      // Modo normalizado: convertir ambas series a escala 0-100
      if (filteredData1.length > 0) {
        const prices1 = filteredData1.map(d => d.price);
        const normalizedPrices1 = normalizeData(prices1);
        
        data.push({
          x: filteredData1.map(d => d.timestamp),
          y: normalizedPrices1,
          type: 'scatter',
          mode: 'lines+markers',
          name: `${selectedItem.charAt(0).toUpperCase() + selectedItem.slice(1)} (Normalizado)`,
          line: { color: CHART_COLORS[0], width: 3 },
          marker: { size: 5, color: CHART_COLORS[0] },
          hovertemplate: `<b>%{fullData.name}</b><br>Fecha: %{x}<br>Valor Normalizado: %{y:.1f}%<br>Precio Real: ${range1.min.toFixed(4)} - ${range1.max.toFixed(4)}<extra></extra>`
        });
      }

      if (filteredData2.length > 0 && range2) {
        const prices2 = filteredData2.map(d => d.price);
        const normalizedPrices2 = normalizeData(prices2);
        
        data.push({
          x: filteredData2.map(d => d.timestamp),
          y: normalizedPrices2,
          type: 'scatter',
          mode: 'lines+markers',
          name: `${selectedItem2.charAt(0).toUpperCase() + selectedItem2.slice(1)} (Normalizado)`,
          line: { color: CHART_COLORS[1], width: 3 },
          marker: { size: 5, color: CHART_COLORS[1] },
          hovertemplate: `<b>%{fullData.name}</b><br>Fecha: %{x}<br>Valor Normalizado: %{y:.1f}%<br>Precio Real: ${range2.min.toFixed(4)} - ${range2.max.toFixed(4)}<extra></extra>`
        });
      }
    } else if (yAxisMode === 'dual') {
      // Modo dual: usar dos ejes Y diferentes
      if (filteredData1.length > 0) {
        data.push({
          x: filteredData1.map(d => d.timestamp),
          y: filteredData1.map(d => d.price),
          type: 'scatter',
          mode: 'lines+markers',
          name: `${selectedItem.charAt(0).toUpperCase() + selectedItem.slice(1)} (Eje Izq.)`,
          line: { color: CHART_COLORS[0], width: 3 },
          marker: { size: 5, color: CHART_COLORS[0] },
          hovertemplate: '<b>%{fullData.name}</b><br>Fecha: %{x}<br>Precio: $%{y}<extra></extra>',
          yaxis: 'y'
        });
      }

      if (filteredData2.length > 0) {
        data.push({
          x: filteredData2.map(d => d.timestamp),
          y: filteredData2.map(d => d.price),
          type: 'scatter',
          mode: 'lines+markers',
          name: `${selectedItem2.charAt(0).toUpperCase() + selectedItem2.slice(1)} (Eje Der.)`,
          line: { color: CHART_COLORS[1], width: 3 },
          marker: { size: 5, color: CHART_COLORS[1] },
          hovertemplate: '<b>%{fullData.name}</b><br>Fecha: %{x}<br>Precio: $%{y}<extra></extra>',
          yaxis: 'y2'
        });
      }
    } else {
      // Modo lineal o logarítmico normal
      if (filteredData1.length > 0) {
        data.push({
          x: filteredData1.map(d => d.timestamp),
          y: filteredData1.map(d => d.price),
          type: 'scatter',
          mode: 'lines+markers',
          name: selectedItem.charAt(0).toUpperCase() + selectedItem.slice(1),
          line: { color: CHART_COLORS[0], width: 3 },
          marker: { size: 5, color: CHART_COLORS[0] },
          hovertemplate: '<b>%{fullData.name}</b><br>Fecha: %{x}<br>Precio: $%{y}<extra></extra>'
        });
      }

      if (filteredData2.length > 0) {
        data.push({
          x: filteredData2.map(d => d.timestamp),
          y: filteredData2.map(d => d.price),
          type: 'scatter',
          mode: 'lines+markers',
          name: selectedItem2.charAt(0).toUpperCase() + selectedItem2.slice(1),
          line: { color: CHART_COLORS[1], width: 3 },
          marker: { size: 5, color: CHART_COLORS[1] },
          hovertemplate: '<b>%{fullData.name}</b><br>Fecha: %{x}<br>Precio: $%{y}<extra></extra>'
        });
      }
    }

    return data;
  }, [getFilteredDataByDateRange, selectedItem, selectedItem2, yAxisMode]);

  // --- 2. Análisis Histórico de Variación ---
  const historicalAnalysisData = useMemo(() => {
    if (!rawData || selectedItemsForTrends.length === 0) return [];

    return selectedItemsForTrends.map((item, index) => {
      const itemData = rawData.filter(d => d.item === item);
      if (itemData.length === 0) return null;

      if (trendAnalysisType === 'daily') {
        // Análisis por día
        const dailyStats = getDailyStats(itemData);
        return {
          x: dailyStats.map(d => d.day),
          y: dailyStats.map(d => d.avg),
          type: 'scatter',
          mode: 'lines+markers',
          name: `${item.charAt(0).toUpperCase() + item.slice(1)} (Promedio Diario)`,
          line: { color: CHART_COLORS[index % CHART_COLORS.length], width: 3 },
          marker: { size: 6, color: CHART_COLORS[index % CHART_COLORS.length] },
          hovertemplate: '<b>%{fullData.name}</b><br>Fecha: %{x}<br>Precio Promedio: $%{y:.2f}<extra></extra>'
        } as PlotData;
      } else {
        // Análisis por hora (datos completos)
        const sortedData = itemData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        const prices = sortedData.map(d => d.price);
        const movingAvg = getMovingAverage(prices, 5);
        
        return [
          // Datos originales
          {
            x: sortedData.map(d => d.timestamp),
            y: prices,
            type: 'scatter',
            mode: 'markers',
            name: `${item.charAt(0).toUpperCase() + item.slice(1)} (Datos)`,
            marker: { size: 4, color: CHART_COLORS[index % CHART_COLORS.length], opacity: 0.6 },
            hovertemplate: '<b>%{fullData.name}</b><br>Fecha: %{x}<br>Precio: $%{y}<extra></extra>'
          } as PlotData,
          // Media móvil
          {
            x: sortedData.slice(4).map(d => d.timestamp), // Ajustar por ventana de 5
            y: movingAvg,
            type: 'scatter',
            mode: 'lines',
            name: `${item.charAt(0).toUpperCase() + item.slice(1)} (Tendencia)`,
            line: { color: CHART_COLORS[index % CHART_COLORS.length], width: 4 },
            hovertemplate: '<b>%{fullData.name}</b><br>Fecha: %{x}<br>Media Móvil: $%{y:.2f}<extra></extra>'
          } as PlotData
        ];
      }
    }).flat().filter((data): data is PlotData => data !== null);
  }, [rawData, selectedItemsForTrends, trendAnalysisType]);

  // --- 3. Mapa de Calor Mejorado ---
  const heatmapData = useMemo(() => {
    if (!rawData) return null;
    
    const filteredData = rawData.filter(d => 
      d.hour >= timeRange[0] && d.hour <= timeRange[1]
    );

    const items = [...new Set(filteredData.map(d => d.item))].sort();
    const hours = Array.from(
      { length: timeRange[1] - timeRange[0] + 1 },
      (_, i) => timeRange[0] + i
    );
    
    const priceMap = new Map();
    
    filteredData.forEach(d => {
      const key = `${d.item},${d.hour}`;
      if (!priceMap.has(key)) {
        priceMap.set(key, { total: 0, count: 0 });
      }
      const entry = priceMap.get(key);
      entry.total += d.price;
      entry.count += 1;
    });
    
    const z = items.map(item => 
      hours.map(hour => {
        const key = `${item},${hour}`;
        const entry = priceMap.get(key);
        return entry ? Math.round((entry.total / entry.count) * 100) / 100 : null;
      })
    );

    // Crear texto para mostrar valores en el mapa
    const text = items.map(item => 
      hours.map(hour => {
        const key = `${item},${hour}`;
        const entry = priceMap.get(key);
        return entry ? `$${Math.round((entry.total / entry.count) * 100) / 100}` : '';
      })
    );

    return {
      x: hours,
      y: items.map(item => item.charAt(0).toUpperCase() + item.slice(1)),
      z: z,
      text: text
    };
  }, [rawData, timeRange]);

  // Función para obtener layout de Plotly con tema oscuro
  const getPlotLayout = (title: string, xAxisTitle: string, yAxisTitle: string = 'Precio ($)', isDual: boolean = false) => {
    const baseLayout = {
      title: {
        text: title,
        font: { color: '#ffffff', size: 18 }
      },
      xaxis: { 
        title: { text: xAxisTitle, font: { color: '#94a3b8' } },
        type: 'date' as const,
        gridcolor: '#334155',
        tickfont: { color: '#94a3b8' }
      },
      yaxis: { 
        title: { text: yAxisTitle, font: { color: '#94a3b8' } },
        gridcolor: '#334155',
        tickfont: { color: '#94a3b8' }
      },
      height: 500,
      autosize: true,
      hovermode: 'x unified' as const,
      plot_bgcolor: 'rgba(0,0,0,0)',
      paper_bgcolor: 'rgba(0,0,0,0)',
      font: { color: '#ffffff' },
      showlegend: true,
      legend: {
        font: { color: '#94a3b8' },
        bgcolor: 'rgba(26, 31, 46, 0.8)',
        bordercolor: '#334155',
        borderwidth: 1
      }
    };

    if (isDual) {
      return {
        ...baseLayout,
        yaxis2: {
          title: { text: 'Precio ($)', font: { color: '#94a3b8' } },
          overlaying: 'y',
          side: 'right',
          gridcolor: '#334155',
          tickfont: { color: '#94a3b8' }
        }
      };
    }

    return baseLayout;
  };

  // --- Renderizado de la UI ---
  if (loading) return <article aria-busy="true">Cargando datos...</article>;
  
  if (error) return (
    <article className="error-message">
      <h2>Error al cargar los datos</h2>
      <p>{error}</p>
    </article>
  );

  const availableDays = rawData ? [...new Set(rawData.map(d => d.day))].sort() : [];
  const availableItems = rawData ? [...new Set(rawData.map(d => d.item))].sort() : [];

  return (
    <>
      <header>
        <h1>Dashboard de Precios del Juego</h1>
        <p>Análisis interactivo de la economía del juego con visualizaciones avanzadas</p>
      </header>

      {/* Nuevo banner de precios actuales */}
      <article className="current-prices-banner">
        <header>
          <h2>Precios Actuales del Mercado</h2>
        </header>
        <div className="prices-grid">
          {Object.entries(currentPrices).map(([item, price]) => (
            <div key={item} className="price-item">
              <span className="item-name">{item.charAt(0).toUpperCase() + item.slice(1)}</span>
              <span className="item-price">${price.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </article>

      <main>
        {/* --- Gráfico 1: Evolución de Precio Mejorado --- */}
        <article className="glow">
          <header>
            <h2>Evolución de Precio por Item</h2>
          </header>
          
          <div className="controls-grid">
            <div className="control-group">
              <label htmlFor="date-range-select">Rango de fechas</label>
              <select
                id="date-range-select"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
              >
                <option value="single">Día específico</option>
                <option value="range">Rango de días</option>
                <option value="all">Todos los días</option>
              </select>
            </div>
            
            {dateRange === 'single' && (
              <div className="control-group">
                <label htmlFor="day-select">Día</label>
                <select
                  id="day-select"
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                >
                  {availableDays.map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>
            )}
            
            {dateRange === 'range' && (
              <>
                <div className="control-group">
                  <label htmlFor="start-date">Fecha inicio</label>
                  <select
                    id="start-date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  >
                    {availableDays.map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
                <div className="control-group">
                  <label htmlFor="end-date">Fecha fin</label>
                  <select
                    id="end-date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  >
                    {availableDays.map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            
            <div className="control-group">
              <label htmlFor="item-select">Item Principal</label>
              <select
                id="item-select"
                value={selectedItem}
                onChange={(e) => setSelectedItem(e.target.value)}
              >
                {availableItems.map(item => (
                  <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>
                ))}
              </select>
            </div>
            
            <div className="control-group">
              <label htmlFor="item-select-2">Item Secundario</label>
              <select
                id="item-select-2"
                value={selectedItem2}
                onChange={(e) => setSelectedItem2(e.target.value)}
              >
                <option value="">Ninguno</option>
                {availableItems.map(item => (
                  <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label>Modo de Visualización</label>
              <div className="radio-group">
                <div className="radio-item">
                  <input
                    type="radio"
                    id="linear"
                    value="linear"
                    checked={yAxisMode === 'linear'}
                    onChange={(e) => setYAxisMode(e.target.value)}
                  />
                  <label htmlFor="linear">Lineal</label>
                </div>
                <div className="radio-item">
                  <input
                    type="radio"
                    id="dual"
                    value="dual"
                    checked={yAxisMode === 'dual'}
                    onChange={(e) => setYAxisMode(e.target.value)}
                  />
                  <label htmlFor="dual">Dual</label>
                </div>
                <div className="radio-item">
                  <input
                    type="radio"
                    id="normalized"
                    value="normalized"
                    checked={yAxisMode === 'normalized'}
                    onChange={(e) => setYAxisMode(e.target.value)}
                  />
                  <label htmlFor="normalized">Normalizado</label>
                </div>
              </div>
            </div>
          </div>

          <div className="plot-container">
            <Plot
              data={priceEvolutionData}
              layout={getPlotLayout(
                `Evolución de Precios - ${dateRange === 'single' ? selectedDay : dateRange === 'range' ? `${startDate} a ${endDate}` : 'Todos los días'}`,
                'Fecha y Hora',
                yAxisMode === 'normalized' ? 'Valor Normalizado (%)' : 'Precio ($)',
                yAxisMode === 'dual'
              )}
              useResizeHandler={true}
              style={{ width: '100%', height: '100%' }}
              config={{ displayModeBar: false }}
            />
          </div>
        </article>

        {/* --- Gráfico 2: Análisis Histórico de Variación --- */}
        <article className="glow">
          <header>
            <h2>Análisis Histórico de Variación</h2>
          </header>
          
          <div className="controls-grid">
            <div className="control-group">
              <label>Tipo de análisis</label>
              <div className="radio-group">
                <div className="radio-item">
                  <input
                    type="radio"
                    id="daily"
                    value="daily"
                    checked={trendAnalysisType === 'daily'}
                    onChange={(e) => setTrendAnalysisType(e.target.value)}
                  />
                  <label htmlFor="daily">Promedio Diario</label>
                </div>
                <div className="radio-item">
                  <input
                    type="radio"
                    id="hourly"
                    value="hourly"
                    checked={trendAnalysisType === 'hourly'}
                    onChange={(e) => setTrendAnalysisType(e.target.value)}
                  />
                  <label htmlFor="hourly">Datos por Hora + Tendencia</label>
                </div>
              </div>
            </div>
            
            <div className="control-group">
              <label>Items a analizar</label>
              <div className="checkbox-group">
                {availableItems.map(item => (
                  <div key={item} className="checkbox-item">
                    <input
                      type="checkbox"
                      id={`trend-${item}`}
                      checked={selectedItemsForTrends.includes(item)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedItemsForTrends([...selectedItemsForTrends, item]);
                        } else {
                          setSelectedItemsForTrends(selectedItemsForTrends.filter(i => i !== item));
                        }
                      }}
                    />
                    <label htmlFor={`trend-${item}`}>{item.charAt(0).toUpperCase() + item.slice(1)}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="plot-container">
            <Plot
              data={historicalAnalysisData}
              layout={getPlotLayout(
                `Análisis de Tendencias - ${trendAnalysisType === 'daily' ? 'Promedio Diario' : 'Datos Horarios con Tendencia'}`,
                trendAnalysisType === 'daily' ? 'Fecha' : 'Fecha y Hora'
              )}
              useResizeHandler={true}
              style={{ width: '100%', height: '100%' }}
              config={{ displayModeBar: false }}
            />
          </div>
        </article>

        {/* --- Gráfico 3: Mapa de Calor Mejorado --- */}
        {heatmapData && (
          <article className="glow">
            <header>
              <h2>Mapa de Calor de Precios por Hora</h2>
            </header>
            
            <div className="controls-grid">
              <div className="control-group">
                <label>Rango de horas</label>
                <div className="range-controls">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={timeRange[0]}
                    onChange={(e) => setTimeRange([parseInt(e.target.value), timeRange[1]])}
                  />
                  <span>a</span>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={timeRange[1]}
                    onChange={(e) => setTimeRange([timeRange[0], parseInt(e.target.value)])}
                  />
                </div>
              </div>
            </div>

            <div className="plot-container">
              <Plot
                data={[{
                  x: heatmapData.x,
                  y: heatmapData.y,
                  z: heatmapData.z,
                  text: heatmapData.text,
                  texttemplate: "%{text}",
                  textfont: { size: 10 },
                  type: 'heatmap',
                  colorscale: 'Viridis',
                  reversescale: true,
                  hovertemplate: '<b>%{y}</b><br>Hora: %{x}:00<br>Precio Promedio: $%{z}<extra></extra>'
                }]}
                layout={{
                  ...getPlotLayout('Mapa de Calor de Precios Promedio por Hora', 'Hora del Día (UTC)', 'Items'),
                  height: 600
                }}
                useResizeHandler={true}
                style={{ width: '100%', height: '100%' }}
                config={{ displayModeBar: false }}
              />
            </div>
          </article>
        )}
      </main>
    </>
  );
}