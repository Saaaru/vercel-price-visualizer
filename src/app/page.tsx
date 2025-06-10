// src/app/page.js

"use client"; // ¡Importante! Esto le dice a Next.js que es un componente de cliente

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';

// Carga dinámica de Plotly para que no afecte la carga inicial de la página
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

// --- Funciones de Ayuda para el Procesamiento de Datos ---

// Función para calcular la desviación estándar (nuestra medida de volatilidad)
const getStandardDeviation = (array) => {
  if (!array || array.length === 0) return 0;
  const n = array.length;
  const mean = array.reduce((a, b) => a + b) / n;
  return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
};

export default function HomePage() {
  // --- Estados de la Aplicación ---
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState('cocain'); // Item por defecto

  // --- Carga de Datos ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/prices_2025-23.json'); // Carga desde la carpeta public
        if (!response.ok) {
          throw new Error(`Error HTTP: ${response.status}`);
        }
        const data = await response.json();
        
        // Transformamos los datos a una estructura plana, más fácil de manejar
        const flatData = [];
        for (const [itemName, priceHistory] of Object.entries(data.items)) {
          priceHistory.forEach(record => {
            flatData.push({
              item: itemName,
              timestamp: new Date(record.timestamp), // Convertir a objeto Date
              price: record.price,
              hour: new Date(record.timestamp).getUTCHours()
            });
          });
        }
        
        flatData.sort((a, b) => a.timestamp - b.timestamp); // Ordenar por fecha
        setRawData(flatData);
        
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []); // El array vacío asegura que esto se ejecute solo una vez

  // --- Memoización de Datos Procesados ---
  // useMemo evita recalcular en cada render, mejorando el rendimiento.

  // 1. Datos para el gráfico de evolución de precios
  const priceEvolutionData = useMemo(() => {
    if (!rawData) return [];
    const filteredData = rawData.filter(d => d.item === selectedItem);
    return [{
      x: filteredData.map(d => d.timestamp),
      y: filteredData.map(d => d.price),
      type: 'scatter',
      mode: 'lines+markers',
      name: selectedItem,
    }];
  }, [rawData, selectedItem]);

  // 2. Datos para el gráfico de volatilidad
  const volatilityData = useMemo(() => {
    if (!rawData) return { items: [], values: [] };
    const volatilityMap = new Map();
    const items = [...new Set(rawData.map(d => d.item))]; // Lista única de items
    
    items.forEach(item => {
      const prices = rawData.filter(d => d.item === item).map(d => d.price);
      volatilityMap.set(item, getStandardDeviation(prices));
    });
    
    const sortedVolatility = [...volatilityMap.entries()].sort((a, b) => b[1] - a[1]);

    return {
      items: sortedVolatility.map(d => d[0]),
      values: sortedVolatility.map(d => d[1]),
    };
  }, [rawData]);

  // 3. Datos para el mapa de calor de precios por hora
  const hourlyHeatmapData = useMemo(() => {
    if (!rawData) return null;
    const items = [...new Set(rawData.map(d => d.item))].sort();
    const hours = [...Array(24).keys()]; // 0-23
    
    const priceMap = new Map(); // "item,hour" -> { total: X, count: Y }
    
    rawData.forEach(d => {
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
        return entry ? entry.total / entry.count : null; // null para celdas sin datos
      })
    );

    return {
      x: hours,
      y: items,
      z: z,
    };
  }, [rawData]);

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
          <label htmlFor="item-select">Selecciona un item:</label>
          <select
            id="item-select"
            value={selectedItem}
            onChange={(e) => setSelectedItem(e.target.value)}
          >
            {[...new Set(rawData.map(d => d.item))].sort().map(item => (
              <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>
            ))}
          </select>
        </header>
        <Plot
          data={priceEvolutionData}
          layout={{
            title: `Precio de ${selectedItem.charAt(0).toUpperCase() + selectedItem.slice(1)}`,
            xaxis: { title: 'Fecha' },
            yaxis: { title: 'Precio' },
            height: 450,
            autosize: true
          }}
          useResizeHandler={true}
          style={{ width: '100%', height: '100%' }}
        />
      </article>

      {/* --- Gráfico 2: Volatilidad --- */}
      <article>
        <header>
          <h2>Volatilidad por Item</h2>
          <p>La desviación estándar del precio. Un valor más alto significa un precio más inestable.</p>
        </header>
        <Plot
          data={[{
            x: volatilityData.items,
            y: volatilityData.values,
            type: 'bar',
          }]}
          layout={{
            title: 'Volatilidad (Desviación Estándar)',
            xaxis: { title: 'Item' },
            yaxis: { title: 'Desviación Estándar' },
            height: 450,
            autosize: true
          }}
          useResizeHandler={true}
          style={{ width: '100%', height: '100%' }}
        />
      </article>

      {/* --- Gráfico 3: Mapa de Calor por Hora --- */}
      {hourlyHeatmapData && (
        <article>
          <header>
            <h2>Mejor Momento para Comprar/Vender (Precio Promedio por Hora UTC)</h2>
            <p>Los colores más fríos (oscuros) indican precios más bajos (ideal para comprar). Los colores cálidos (claros) indican precios altos (ideal para vender).</p>
          </header>
          <Plot
            data={[{
              x: hourlyHeatmapData.x,
              y: hourlyHeatmapData.y,
              z: hourlyHeatmapData.z,
              type: 'heatmap',
              colorscale: 'Viridis',
              reversescale: true // Para que los valores bajos sean oscuros
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