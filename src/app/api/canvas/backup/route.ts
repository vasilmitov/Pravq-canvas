import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = process.env.CANVAS_DATA_DIR || path.join(process.cwd(), 'data', 'canvas');
const BACKUP_DIR = path.join(DATA_DIR, 'backup');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await fs.mkdir(BACKUP_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `state-${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    await fs.writeFile(filepath, JSON.stringify(body, null, 2), 'utf-8');

    return NextResponse.json({ success: true, backupFile: filename });
  } catch (error) {
    console.error('Failed to create backup:', error);
    return NextResponse.json({ success: false, error: 'Failed to backup' }, { status: 500 });
  }
}
