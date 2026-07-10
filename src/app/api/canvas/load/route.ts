import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.env.CANVAS_DATA_DIR || path.join(process.cwd(), 'data', 'canvas'));
const STATE_FILE = path.join(DATA_DIR, 'state.json');

export async function GET() {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json({ nodes: [], edges: [] });
  }
}
