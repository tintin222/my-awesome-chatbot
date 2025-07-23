import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { generateText } from 'ai';
import { put } from '@vercel/blob';
import { z } from 'zod';
import { myProvider } from '@/lib/ai/providers';

// PDF processing using Gemini 2.5 Flash
async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    // Convert PDF buffer to base64
    const base64PDF = Buffer.from(pdfBuffer).toString('base64');
    const dataUrl = `data:application/pdf;base64,${base64PDF}`;

    // Use Gemini 2.5 Flash to extract text from PDF
    const { text } = await generateText({
      model: myProvider.languageModel('chat-model-fast'),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract all readable text from this PDF. Preserve structure and formatting as much as possible. Return only the extracted text, no extra commentary.',
            },
            {
              type: 'image',
              image: dataUrl,
            },
          ],
        },
      ],
    });

    if (!text || text.trim().length === 0) {
      throw new Error('No text extracted from PDF by Gemini');
    }
    return text;
  } catch (error) {
    console.error('Error extracting text from PDF with Gemini:', error);
    throw new Error('Failed to extract text from PDF with Gemini');
  }
}

const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 10 * 1024 * 1024, {
      message: 'File size should be less than 10MB',
    })
    .refine((file) => file.type === 'application/pdf', {
      message: 'File type should be PDF',
    }),
});

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as Blob;
    const category = formData.get('category') as string;
    const associatedHotels = formData.get('associatedHotels') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }

    // Validate file
    const validatedFile = FileSchema.safeParse({ file });
    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(', ');
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // Get filename
    const filename = (formData.get('file') as File).name;
    const fileBuffer = await file.arrayBuffer();

    // Extract text from PDF using OpenAI Vision
    const extractedText = await extractTextFromPDF(fileBuffer);

    if (!extractedText || extractedText.trim().length === 0) {
      return NextResponse.json(
        { error: 'Could not extract text from PDF' },
        { status: 400 }
      );
    }

    // Optionally store the original PDF file
    let pdfUrl = '';
    try {
      const blob = await put(`pdfs/${filename}`, fileBuffer, {
        access: 'public',
        contentType: 'application/pdf',
      });
      pdfUrl = blob.url;
    } catch (error) {
      console.warn('Failed to upload PDF to blob storage:', error);
      // Continue without storing the file
    }

    // Parse associated hotels
    let hotels: string[] = ['all'];
    if (associatedHotels) {
      try {
        hotels = JSON.parse(associatedHotels);
      } catch {
        hotels = ['all'];
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        filename,
        extractedText,
        category,
        associatedHotels: hotels,
        pdfUrl,
      },
    });
  } catch (error) {
    console.error('Error processing PDF upload:', error);
    return NextResponse.json(
      { error: 'Failed to process PDF upload' },
      { status: 500 }
    );
  }
} 