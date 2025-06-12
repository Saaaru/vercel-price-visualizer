import { NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('API Route: Iniciando petición a la API externa...');
    const response = await fetch('https://api2.warera.io/trpc/itemTrading.getPrices', {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      next: { revalidate: 60 }, // Revalidar cada 60 segundos
    });

    if (!response.ok) {
      console.error('API Route: Error en la respuesta de la API externa:', response.status);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('API Route: Datos recibidos exitosamente');
    return NextResponse.json(data);
  } catch (error) {
    console.error('API Route: Error al obtener los precios:', error);
    return NextResponse.json(
      { error: 'Error al obtener los precios' },
      { status: 500 }
    );
  }
} 