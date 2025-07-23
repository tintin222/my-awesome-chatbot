import { NextResponse } from 'next/server';
import { getAllGlobalContext } from '@/lib/db/queries';

export async function GET() {
  const items = await getAllGlobalContext();
  return NextResponse.json(items);
} 