// src/app/page.js

"use client"; // ¡Importante! Esto le dice a Next.js que es un componente de cliente

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';

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
  line?: {color: string};
}

interface PlotProps {
  data: PlotData[];
  layout: {
    title: string;
    xaxis: { title: string };
    yaxis?: { title: string };
    height: number;
    autosize: boolean;
    showlegend?: boolean;
  };
  useResizeHandler: boolean;
  style: { width: string; height: string };
}

// Carga dinámica de Plotly para que no afecte la carga inicial de la página
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false }) as React.ComponentType<PlotProps>;

// --- Funciones de Ayuda para el Procesamiento de Datos ---

// Función para calcular la desviación estándar (nuestra medida de volatilidad)
const getStandardDeviation = (array: number[]): number => {
  if (!array || array.length === 0) return 0;
  const n = array.length;
  const mean = array.reduce((a: number, b: number) => a + b) / n;
  return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a: number, b: number) => a + b) / n);
};

// Función para obtener estadísticas de velas
const getCandleStats = (prices: number[]) => {
  if (!prices || prices.length === 0) return null;
  return {
    open: prices[0],
    high: Math.max(...prices),
    low: Math.min(...prices),
    close: prices[prices.length - 1],
    std: getStandardDeviation(prices)
  };
};

export default function HomePage() {
  // --- Estados de la Aplicación ---
  const [rawData, setRawData] = useState<FlatDataItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState('cocain'); // Item por defecto
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [selectedItem2, setSelectedItem2] = useState<string>('');
  const [selectedItemsForCandles, setSelectedItemsForCandles] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<[number, number]>([0, 23]);

  // --- Carga de Datos ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/prices_2025-23.json');
        if (!response.ok) {
          throw new Error(`Error HTTP: ${response.status}`);
        }
        const data = await response.json() as RawData;
        
        const flatData: FlatDataItem[] = [];
        for (const [itemName, priceHistory] of Object.entries(data.items)) {
          priceHistory.forEach((record: PriceRecord) => {
            const date = new Date(record.timestamp);
            flatData.push({
              item: itemName,
              timestamp: date,
              price: record.price,
              hour: date.getUTCHours(),
              day: date.toISOString().split('T')[0]
            });
          });
        }
        
        flatData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        setRawData(flatData);
        
        // Establecer el primer día disponible como seleccionado
        if (flatData.length > 0) {
          setSelectedDay(flatData[0].day);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Error desconocido');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // --- Memoización de Datos Procesados ---
  // useMemo evita recalcular en cada render, mejorando el rendimiento.

  // 1. Datos para el gráfico de evolución de precios
  const priceEvolutionData = useMemo(() => {
    if (!rawData) return [];
    
    const data: PlotData[] = [];
    
    // Datos del primer item
    const filteredData1 = rawData.filter(d => 
      d.item === selectedItem && d.day === selectedDay
    );
    
    if (filteredData1.length > 0) {
      data.push({
        x: filteredData1.map(d => d.timestamp),
        y: filteredData1.map(d => d.price),
        type: 'scatter',
        mode: 'lines+markers',
        name: selectedItem,
      });
    }

    // Datos del segundo item si está seleccionado
    if (selectedItem2) {
      const filteredData2 = rawData.filter(d => 
        d.item === selectedItem2 && d.day === selectedDay
      );
      
      if (filteredData2.length > 0) {
        data.push({
          x: filteredData2.map(d => d.timestamp),
          y: filteredData2.map(d => d.price),
          type: 'scatter',
          mode: 'lines+markers',
          name: selectedItem2,
        });
      }
    }

    return data;
  }, [rawData, selectedItem, selectedItem2, selectedDay]);

  // 2. Datos para el gráfico de tendencias
  const trendData = useMemo(() => {
    if (!rawData || selectedItemsForCandles.length === 0) return [];

    return selectedItemsForCandles.map(item => {
      const itemData = rawData.filter(d => d.item === item);
      if (itemData.length === 0) return null;

      // Ordenar por timestamp
      itemData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Calcular media móvil y desviación estándar
      const windowSize = 5; // Tamaño de la ventana para el cálculo
      const prices = itemData.map(d => d.price);
      const timestamps = itemData.map(d => d.timestamp);

      const movingAverages = [];
      const upperBand = [];
      const lowerBand = [];

      for (let i = windowSize - 1; i < prices.length; i++) {
        const window = prices.slice(i - windowSize + 1, i + 1);
        const avg = window.reduce((a, b) => a + b) / windowSize;
        const std = getStandardDeviation(window);
        
        movingAverages.push(avg);
        upperBand.push(avg + std);
        lowerBand.push(avg - std);
      }

      const adjustedTimestamps = timestamps.slice(windowSize - 1);

      return [
        // Banda superior
        {
          x: adjustedTimestamps,
          y: upperBand,
          type: 'scatter',
          mode: 'lines',
          line: {width: 0, color: 'transparent'},
          showlegend: false,
          name: `${item} - Banda Superior`,
          fill: 'tonexty',
          fillcolor: 'rgba(0, 100, 80, 0.2)'
        } as PlotData,
        // Banda inferior
        {
          x: adjustedTimestamps,
          y: lowerBand,
          type: 'scatter',
          mode: 'lines',
          line: {width: 0, color: 'transparent'},
          showlegend: false,
          name: `${item} - Banda Inferior`,
          fill: 'tonexty',
          fillcolor: 'rgba(0, 100, 80, 0.2)'
        } as PlotData,
        // Línea de tendencia
        {
          x: adjustedTimestamps,
          y: movingAverages,
          type: 'scatter',
          mode: 'lines',
          name: item,
          line: {color: 'rgb(0, 100, 80)'}
        } as PlotData,
        // Puntos de datos originales
        {
          x: timestamps,
          y: prices,
          type: 'scatter',
          mode: 'markers',
          name: `${item} - Datos`,
          marker: {
            size: 4,
            color: 'rgba(0, 100, 80, 0.5)'
          }
        } as PlotData
      ];
    }).flat().filter((data): data is PlotData => data !== null);
  }, [rawData, selectedItemsForCandles]);

  // 3. Datos para el mapa de calor
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
        return entry ? entry.total / entry.count : null;
      })
    );

    return {
      x: hours,
      y: items,
      z: z,
    };
  }, [rawData, timeRange]);

  // --- Renderizado de la UI ---
  if (loading) return <article aria-busy="true">Cargando datos...</article>;
  if (error) return <article><h2>Error</h2><p>{error}</p></article>;

  return (
    <>
      <header>
        <h1>Dashboard de Precios del Juego</h1>
        <p>Análisis interactivo de la economía del juego.</p>
      </header>

      {/* --- Gráfico 1: Evolución de Precio --- */}
      <article>
        <header>
          <h2>Evolución de Precio por Item</h2>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label htmlFor="day-select">Día:</label>
              <select
                id="day-select"
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
              >
                <option value="all">Todos los días</option>
                {rawData && [...new Set(rawData.map(d => d.day))].sort().map(day => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="item-select">Item 1:</label>
              <select
                id="item-select"
                value={selectedItem}
                onChange={(e) => setSelectedItem(e.target.value)}
              >
                {rawData && [...new Set(rawData.map(d => d.item))].sort().map(item => (
                  <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="item-select-2">Item 2 (opcional):</label>
              <select
                id="item-select-2"
                value={selectedItem2}
                onChange={(e) => setSelectedItem2(e.target.value)}
              >
                <option value="">Ninguno</option>
                {rawData && [...new Set(rawData.map(d => d.item))].sort().map(item => (
                  <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
        </header>
        <Plot
          data={priceEvolutionData}
          layout={{
            title: `Evolución de Precios${selectedDay === 'all' ? ' - Todos los días' : ` - ${selectedDay}`}`,
            xaxis: { title: 'Hora' },
            yaxis: { title: 'Precio' },
            height: 450,
            autosize: true
          }}
          useResizeHandler={true}
          style={{ width: '100%', height: '100%' }}
        />
      </article>

      {/* --- Gráfico 2: Análisis de Tendencias --- */}
      <article>
        <header>
          <h2>Análisis de Tendencias</h2>
          <div style={{ marginBottom: '1rem' }}>
            <label>Selecciona los items a analizar:</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
              {rawData && [...new Set(rawData.map(d => d.item))].sort().map(item => (
                <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedItemsForCandles.includes(item)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItemsForCandles([...selectedItemsForCandles, item]);
                      } else {
                        setSelectedItemsForCandles(selectedItemsForCandles.filter(i => i !== item));
                      }
                    }}
                  />
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </label>
              ))}
            </div>
            <p style={{ marginTop: '0.5rem', fontSize: '0.9em', color: '#666' }}>
              La banda sombreada representa la volatilidad (desviación estándar) alrededor de la media móvil.
            </p>
          </div>
        </header>
        <Plot
          data={trendData}
          layout={{
            title: 'Análisis de Tendencias y Volatilidad',
            xaxis: { title: 'Tiempo' },
            yaxis: { title: 'Precio' },
            height: 450,
            autosize: true,
            showlegend: true
          }}
          useResizeHandler={true}
          style={{ width: '100%', height: '100%' }}
        />
      </article>

      {/* --- Gráfico 3: Mapa de Calor --- */}
      {heatmapData && (
        <article>
          <header>
            <h2>Mapa de Calor de Precios por Hora</h2>
            <div style={{ marginBottom: '1rem' }}>
              <label>Rango de horas:</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
          </header>
          <Plot
            data={[{
              x: heatmapData.x,
              y: heatmapData.y,
              z: heatmapData.z,
              type: 'heatmap',
              colorscale: 'Viridis',
              reversescale: true
            }]}
            layout={{
              title: 'Mapa de Calor de Precios Promedio',
              xaxis: { title: 'Hora del Día (UTC)' },
              height: 600,
              autosize: true
            }}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%' }}
          />
        </article>
      )}
    </>
  );
}