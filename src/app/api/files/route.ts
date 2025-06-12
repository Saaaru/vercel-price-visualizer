import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), 'public', 'data');
    
    // Verificar si el directorio existe
    if (!fs.existsSync(dataDir)) {
      return NextResponse.json([], { status: 200 });
    }
    
    // Leer archivos del directorio
    const files = fs.readdirSync(dataDir)
      .filter(file => file.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a)); // Ordenar por nombre, más reciente primero
    
    return NextResponse.json(files);
  } catch (error) {
    console.error('Error al listar archivos:', error);
    return NextResponse.json(
      { error: 'Error al listar archivos' },
      { status: 500 }
    );
  }
} 