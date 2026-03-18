
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Session from '@/models/Session';
import { v2 as cloudinary } from 'cloudinary';

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
   
  

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const base64 = `data:${file.type};base64,${buffer.toString('base64')}`;

const uploadResult = await cloudinary.uploader.upload(base64, {
  folder: type === 'snapshot' ? 'snapshots' : 'recordings',
});

const fileUrl = uploadResult.secure_url;

    // Update session in DB
    const updateField = type === 'snapshot' ? { snapshots: fileUrl } : { recordings: fileUrl };
   await Session.findOneAndUpdate(
  { _id: sessionId },
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
