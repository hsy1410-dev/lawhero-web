import OpenAI from "openai";
import { getStorage } from "firebase-admin/storage";
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  try {
    const { field, subField } = req.body;

    const prompt = `
Create a square app icon that symbolically represents 
"${subField}" in the ${field} legal field.

Style: modern flat design, clean vector illustration.
No text. No watermark.
Balanced composition, centered subject.
Colors and background should be creatively chosen 
to match the concept naturally.
High resolution, app-ready icon style.
`;

    const image = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
    });

    const base64 = image.data[0].b64_json;
    const buffer = Buffer.from(base64, "base64");

    const bucket = admin.storage().bucket();
    const file = bucket.file(`community_ai_icons/${Date.now()}.png`);

    await file.save(buffer, {
      metadata: { contentType: "image/png" },
    });

    await file.makePublic();

    const imageUrl = file.publicUrl();

    res.status(200).json({ imageUrl });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "AI 생성 실패" });
  }
}