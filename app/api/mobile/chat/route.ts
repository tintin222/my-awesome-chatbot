import { myProvider } from '@/lib/ai/providers';
import {
  getAllActiveGlobalContext,
  getChatById,
  saveChat,
  saveMessages,
  getUser,
  createUser,
} from '@/lib/db/queries';
import { type GlobalContext } from '@/lib/db/schema';
import { generateUUID } from '@/lib/utils';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash } from 'crypto';

export const maxDuration = 60;

// Helper function to convert mobile userId to UUID format
function mobileUserIdToUUID(mobileUserId: string): string {
  // Create a consistent hash from the mobile user ID
  const hash = createHash('md5').update(`mobile_${mobileUserId}`).digest('hex');
  // Format as UUID v4
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    hash.substring(12, 16),
    hash.substring(16, 20),
    hash.substring(20, 32)
  ].join('-');
}

const postRequestBodySchema = z.object({
  chatId: z.string().uuid().describe('The UUID of the chat session. Generate a new one for each new conversation.'),
  userId: z.string().min(1).max(100).describe('The mobile app user ID (can be device ID, app-specific user ID, etc.)'),
  message: z.string().min(1).max(2000).describe('The user\'s message.'),
  selectedChatModel: z.enum([
    'chat-model',
    'chat-model-reasoning',
    'chat-model-fast',
    'gemini-2.5-pro-preview',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ]).optional().describe('The chat model to use for the response.'),
});

const PERSONA_PROMPT = `You are a helpful and polite hotel assistant representing Gloria Hotels & Resorts. Your primary goal is to answer guest questions accurately using *only* the information provided in the context below.

**Response Guidelines:**
*   Address the guest directly and politely.
*   Answer concisely and focus on the specific question asked.
*   **Crucially: NEVER mention the context, documents, knowledge base, or how you obtained the information.** Simply provide the answer as if it's known hotel information.
*   **Avoid phrases like:** "Based on the document...", "According to the information I have...", "The context states...", "In the provided text...".
*   If the information needed to answer the question is NOT present in the provided context, politely respond with: "I apologize, but I don't have information about [specific topic] in my current resources. For the most accurate and up-to-date details about this, I recommend contacting the hotel directly."
*   Do not invent information or answer questions outside the scope of the provided context.
*   Maintain a friendly and professional tone.

**Formatting Guidelines:**
*   Structure your responses using markdown headers (## or ###) to organize different sections
*   Use bullet points (- or *) for lists of items, features, or services
*   When presenting pricing information, format it clearly with the item and price separated
*   For schedules or timings, present them in a clear, structured format
*   Keep related information grouped together under appropriate headers

---
Provided Context & Instructions:
`;

export async function POST(request: Request) {
  console.log('[POST /api/mobile/chat] Received request');
  let requestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
    console.log(
      '[POST /api/mobile/chat] Parsed request body for chat:',
      requestBody.chatId,
      'user:',
      requestBody.userId,
    );
  } catch (error) {
    console.error('[POST /api/mobile/chat] Invalid request body:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  try {
    const { chatId, userId, message, selectedChatModel } = requestBody;
    const modelToUse = selectedChatModel || 'gemini-1.5-pro';

    // Convert mobile userId to a consistent UUID format
    const mobileUserUUID = mobileUserIdToUUID(userId);
    console.log(`[POST /api/mobile/chat] Mobile user ${userId} converted to UUID: ${mobileUserUUID}`);

    // Ensure the mobile user exists in the User table
    const mobileUserEmail = `mobile_${userId}@app.local`;
    let existingUsers = await getUser(mobileUserEmail);
    let actualUserId: string;
    
    if (existingUsers.length === 0) {
      console.log(`[POST /api/mobile/chat] Creating new mobile user: ${mobileUserEmail}`);
      try {
        await createUser(mobileUserEmail, 'mobile_user_password');
        console.log(`[POST /api/mobile/chat] Mobile user created successfully`);
        // Get the newly created user to find their actual ID
        existingUsers = await getUser(mobileUserEmail);
        if (existingUsers.length === 0) {
          return NextResponse.json(
            { error: 'Failed to create mobile user' },
            { status: 500 },
          );
        }
        actualUserId = existingUsers[0].id;
      } catch (error) {
        console.error(`[POST /api/mobile/chat] Failed to create mobile user:`, error);
        // If user creation fails, it might already exist due to race condition
        existingUsers = await getUser(mobileUserEmail);
        if (existingUsers.length === 0) {
          return NextResponse.json(
            { error: 'Failed to create or find mobile user' },
            { status: 500 },
          );
        }
        actualUserId = existingUsers[0].id;
      }
    } else {
      actualUserId = existingUsers[0].id;
      console.log(`[POST /api/mobile/chat] Using existing mobile user ID: ${actualUserId}`);
    }

    // Check if chat exists, if not create it
    let savedChat = await getChatById({ id: chatId });
    if (!savedChat) {
      console.log(
        `[POST /api/mobile/chat] Chat ${chatId} not found, creating new one for mobile user: ${userId}`,
      );
      
      await saveChat({ 
        id: chatId, 
        userId: actualUserId, 
        title: `Mobile Chat - ${new Date().toLocaleDateString()}` 
      });
      savedChat = await getChatById({ id: chatId });
    }

    if (!savedChat) {
      return NextResponse.json(
        { error: 'Failed to create or find chat' },
        { status: 500 },
      );
    }
    
    // Verify that this chat belongs to this mobile user
    if (savedChat.userId !== actualUserId) {
        console.log(`[POST /api/mobile/chat] Chat ownership mismatch. Expected: ${actualUserId}, Found: ${savedChat.userId}`);
        return NextResponse.json({ error: 'Chat does not belong to this user' }, { status: 403 });
    }

    // Prepare messages array with just the current message for simplicity
    // In production, you might want to include chat history
    const messages = [{ role: 'user' as const, content: message }];

    // --- Start: Fetch and Process Context ---
    const chatBehaviorPrompt = savedChat?.systemPrompt || '';

    const allActiveContextItems = await getAllActiveGlobalContext();
    console.log(
      `[POST /api/mobile/chat] Fetched ${allActiveContextItems.length} active global context items.`,
    );

    let targetHotel: string | null = null;
    const lowerCaseMessage = message.toLowerCase();
    if (lowerCaseMessage.includes('serenity')) {
      targetHotel = 'serenity';
    } else if (lowerCaseMessage.includes('golf')) {
      targetHotel = 'golf';
    } else if (lowerCaseMessage.includes('verde')) {
      targetHotel = 'verde';
    }

    let filteredContextItems: GlobalContext[] = [];
    if (targetHotel) {
      filteredContextItems = allActiveContextItems.filter((item) =>
        item.associatedHotels?.includes(targetHotel),
      );
    } else {
      filteredContextItems = allActiveContextItems.filter((item) =>
        item.associatedHotels?.includes('all'),
      );
    }

    let formattedContext = '';
    const groupedContext: Record<string, string[]> = {};

    filteredContextItems.forEach((item) => {
      if (!groupedContext[item.category]) {
        groupedContext[item.category] = [];
      }
      groupedContext[item.category].push(item.content);
    });
    
    if (targetHotel && Object.keys(groupedContext).length > 0) {
      const hotelName = targetHotel.charAt(0).toUpperCase() + targetHotel.slice(1);
      formattedContext += `Context Specifically for Gloria ${hotelName}:\n`;
    } else if (Object.keys(groupedContext).length > 0) {
      formattedContext += `General Context (Applies to All Hotels):\n`;
    }

    for (const category in groupedContext) {
      formattedContext += `\n## ${category}\n`;
      groupedContext[category].forEach((content) => {
        formattedContext += `${content}\n`;
      });
    }

    // --- End: Fetch and Process Context ---

    let finalSystemPrompt = PERSONA_PROMPT;

    if (formattedContext.trim() !== '') {
      finalSystemPrompt += `${formattedContext.trim()}\n\n---\n\n`;
    }

    if (chatBehaviorPrompt.trim() !== '') {
      finalSystemPrompt += `Chat Behavior Instructions:\n${chatBehaviorPrompt.trim()}`;
    }
    
    const model = myProvider.languageModel(modelToUse);

    console.log(
      `[POST /api/mobile/chat] Calling AI model ${modelToUse}. System Prompt length: ${finalSystemPrompt.length}`,
    );

    const { text } = await generateText({
        model,
        system: finalSystemPrompt,
        messages: messages,
    });
    
    // Save user and assistant messages to the database
    const userMessageId = generateUUID();
    const assistantMessageId = generateUUID();

    await saveMessages({
        messages: [
            {
                id: userMessageId,
                chatId: chatId,
                role: 'user',
                parts: [{ type: 'text', text: message }],
                attachments: [],
                createdAt: new Date(),
            },
            {
                id: assistantMessageId,
                chatId: chatId,
                role: 'assistant',
                parts: [{ type: 'text', text }],
                attachments: [],
                createdAt: new Date(),
            }
        ]
    });

    console.log(
      `[POST /api/mobile/chat] Successfully processed message for mobile user ${userId}, chat ${chatId}`,
    );

    return NextResponse.json({ 
      response: text,
      chatId: chatId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[POST /api/mobile/chat] Critical error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 },
    );
  }
} 