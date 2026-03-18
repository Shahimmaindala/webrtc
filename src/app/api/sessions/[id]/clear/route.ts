
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Session from '@/models/Session';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();
    const { id } = await params;
    const { type } = await request.json(); // type: 'recordings' | 'snapshots'

    if (!type || !['recordings', 'snapshots'].includes(type)) {
      return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 });
    }

    const session = await Session.findById(id);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    const filesToDelete = type === 'recordings' ? session.recordings : session.snapshots;

    // 1. Delete physical files
    for (const fileUrl of filesToDelete) {
      try {
        const filePath = path.join(process.cwd(), 'public', fileUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error(`Failed to delete file: ${fileUrl}`, err);
      }
    }

    // 2. Update DB
    const update = type === 'recordings' ? { recordings: [] } : { snapshots: [] };
    await Session.findByIdAndUpdate(id, update);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Clear error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
