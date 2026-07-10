import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = process.env.CANVAS_DATA_DIR || path.join(process.cwd(), 'data', 'canvas');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Ensure directory exists
    await fs.mkdir(DATA_DIR, { recursive: true });

    // Write state file
    await fs.writeFile(STATE_FILE, JSON.stringify(body, null, 2), 'utf-8');

    return NextResponse.json({ success: true, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Failed to save canvas state:', error);
    return NextResponse.json({ success: false, error: 'Failed to save' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json({ nodes: [], edges: [] });
  }
}
