import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { getVehicleClasses } from '@/lib/graph/queries';

export async function GET() {
  const [mongoResult, graphResult] = await Promise.allSettled([
    connectToDatabase(),
    getVehicleClasses(),
  ]);

  const mongo = mongoResult.status === 'fulfilled' ? 'ok' : 'error';
  const graph = graphResult.status === 'fulfilled' ? 'ok' : 'error';
  const vehicleClassCount = graphResult.status === 'fulfilled' ? graphResult.value.length : 0;

  const status = mongo === 'ok' && graph === 'ok' ? 200 : 503;

  return NextResponse.json({ mongo, graph, vehicleClassCount }, { status });
}
