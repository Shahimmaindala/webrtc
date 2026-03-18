
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Session from '@/models/Session';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    await dbConnect();
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const sessionId = formData.get('sessionId') as string;
    const type = formData.get('type') as 'snapshot' | 'recording';

    console.log(`Upload received: type=${type}, sessionId=${sessionId}, filename=${file.name}, size=${file.size}`);

    if (!file || !sessionId || !type) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${Date.now()}-${file.name || (type === 'snapshot' ? 'snap.png' : 'rec.webm')}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', type === 'snapshot' ? 'snapshots' : 'recordings');

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, buffer);

    const fileUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/uploads/${type === 'snapshot' ? 'snapshots' : 'recordings'}/${filename}`;

    // Update session in DB
    const updateField = type === 'snapshot' ? { snapshots: fileUrl } : { recordings: fileUrl };
   await Session.findByIdAndUpdate(
  sessionId,
  {
    $push: updateField,
    $setOnInsert: { _id: sessionId, createdAt: new Date() }
  },
  { upsert: true }
);

    return NextResponse.json({ success: true, url: fileUrl });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
