import {
  appendClientMessage,
  appendResponseMessages,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';
import { auth, type UserType } from '@/app/(auth)/auth';
import {
  type RequestHints,
  systemPrompt,
  regularPrompt,
  artifactsPrompt,
} from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  getAllGlobalContext,
  getAllActiveGlobalContext,
} from '@/lib/db/queries';
import { generateUUID, getTrailingMessageId } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import { eq, and } from 'drizzle-orm';
import { globalContext, chat, type GlobalContext } from '@/lib/db/schema';

// Define the core persona and restrictions (Corrected Syntax)
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
`; // Separator added

export const maxDuration = 60;

export async function POST(request: Request) {
  console.log('[POST /api/chat] Received request');
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
    console.log(
      '[POST /api/chat] Parsed request body for chat:',
      requestBody.id,
    );
  } catch (error) {
    console.error('[POST /api/chat] Invalid request body:', error);
    return new Response('Invalid request body', { status: 400 });
  }

  try {
    const { id, message, selectedChatModel } = requestBody;
    console.log(
      `[POST /api/chat] Processing chat ${id} with model ${selectedChatModel}`,
    );

    const session = await auth();
    if (!session?.user) {
      console.log('[POST /api/chat] Unauthorized - No session user');
      return new Response('Unauthorized', { status: 401 });
    }
    console.log(
      '[POST /api/chat] Session validated for user:',
      session.user.id,
    );

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new Response(
        'You have exceeded your maximum number of messages for the day! Please try again later.',
        {
          status: 429,
        },
      );
    }

    let isNewChat = false;
    const chatCheck = await getChatById({ id });

    if (!chatCheck) {
      isNewChat = true;
      console.log(`[POST /api/chat] Chat ${id} not found, creating new one.`);
      try {
        const title = await generateTitleFromUserMessage({ message });
        console.log(`[POST /api/chat] Generated title: "${title}"`);
        await saveChat({ id, userId: session.user.id, title });
        console.log(`[POST /api/chat] Saved new chat ${id}`);
      } catch (error) {
        console.error(`[POST /api/chat] Error creating new chat ${id}:`, error);
        return new Response('Failed to create chat', { status: 500 });
      }
    }

    const savedChat = await getChatById({ id });
    if (!savedChat) {
      console.error(
        `[POST /api/chat] CRITICAL: Chat ${id} not found even after potential creation.`,
      );
      return new Response('Failed to create or find chat', { status: 500 });
    }
    console.log(`[POST /api/chat] Successfully fetched/confirmed chat ${id}`);

    if (savedChat.userId !== session.user.id) {
      console.log(`[POST /api/chat] Forbidden - User mismatch for chat ${id}`);
      return new Response('Forbidden', { status: 403 });
    }

    const previousMessages = await getMessagesByChatId({ id });

    const messages = appendClientMessage({
      // @ts-expect-error: todo add type conversion from DBMessage[] to UIMessage[]
      messages: previousMessages,
      message,
    });

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    try {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: 'user',
            parts: message.parts,
            attachments: message.experimental_attachments ?? [],
            createdAt: new Date(),
          },
        ],
      });
      console.log(
        `[POST /api/chat] Saved user message ${message.id} for chat ${id}`,
      );
    } catch (error) {
      console.error(
        `[POST /api/chat] Error saving user message for chat ${id}:`,
        error,
      );
      return new Response('Failed to save message', { status: 500 });
    }

    // --- Start: Fetch and Process Context ---

    // 1. Fetch Chat-specific Behavior Prompt
    let chatBehaviorPrompt = '';
    if (savedChat?.systemPrompt) {
      chatBehaviorPrompt = savedChat.systemPrompt;
      console.log('[POST /api/chat] Fetched chat-specific behavior prompt.');
    }

    // 2. Fetch All Active Global Context Items (including associatedHotels)
    const allActiveContextItems = await getAllActiveGlobalContext();
    console.log(
      `[POST /api/chat] Fetched ${allActiveContextItems.length} active global context items.`,
    );

    // 3. Keyword Detection for Target Hotel
    let targetHotel: string | null = null;
    const lastUserMessage = messages[messages.length - 1]?.content;
    if (typeof lastUserMessage === 'string') {
      const lowerCaseMessage = lastUserMessage.toLowerCase();
      if (lowerCaseMessage.includes('serenity')) {
        targetHotel = 'serenity';
      } else if (lowerCaseMessage.includes('golf')) {
        targetHotel = 'golf';
      } else if (lowerCaseMessage.includes('verde')) {
        targetHotel = 'verde';
      }
      if (targetHotel) {
        console.log(`[POST /api/chat] Detected target hotel: ${targetHotel}`);
      }
    }

    // 4. Filter Context Items - Prioritize target hotel if detected
    let filteredContextItems: GlobalContext[] = [];
    if (targetHotel) {
      // If a hotel is detected, ONLY get context specifically for that hotel
      console.log(
        `[POST /api/chat] Filtering for context specific to: ${targetHotel}`,
      );
      filteredContextItems = allActiveContextItems.filter((item) =>
        item.associatedHotels?.includes(targetHotel),
      );
      // Optional: Add back 'all' context if NO specific context was found?
      // if (filteredContextItems.length === 0) {
      //    console.log(`[API Chat] No specific context for ${targetHotel}, falling back to 'all'.`);
      //    filteredContextItems = allActiveContextItems.filter(item => item.associatedHotels?.includes('all'));
      // }
    } else {
      // If no hotel detected, get only the 'all' context
      console.log(
        "[POST /api/chat] No target hotel detected, filtering for 'all' context.",
      );
      filteredContextItems = allActiveContextItems.filter((item) =>
        item.associatedHotels?.includes('all'),
      );
    }

    console.log(
      `[POST /api/chat] Filtered down to ${filteredContextItems.length} relevant context items.`,
    );

    // 5. Format Context String (Group by category, add hotel specifier)
    let formattedContext = '';
    // No longer need separate general/specific grouping, format all filtered items
    const groupedContext: Record<string, string[]> = {};

    filteredContextItems.forEach((item) => {
      if (!groupedContext[item.category]) {
        groupedContext[item.category] = [];
      }
      groupedContext[item.category].push(item.content);
    });

    // Add appropriate header based on whether a target hotel was used for filtering
    if (targetHotel && Object.keys(groupedContext).length > 0) {
      const hotelName =
        targetHotel.charAt(0).toUpperCase() + targetHotel.slice(1);
      formattedContext += `Context Specifically for Gloria ${hotelName}:\n`;
    } else if (Object.keys(groupedContext).length > 0) {
      // Only add general header if no specific hotel context was targeted
      formattedContext += `General Context (Applies to All Hotels):\n`;
    }

    // Append the grouped content
    for (const category in groupedContext) {
      formattedContext += `\n## ${category}\n`;
      groupedContext[category].forEach((content) => {
        formattedContext += `${content}\n`; // Add newline after each item
      });
    }

    if (formattedContext.trim() !== '') {
      console.log('[POST /api/chat] Formatted context string prepared.');
    } else {
      console.log(
        '[POST /api/chat] No relevant global context found or formatted.',
      );
    }

    // --- End: Fetch and Process Context ---

    // --- Combine Prompts and Call AI ---

    // 6. Combine persona, global context, and chat-specific behavior prompt
    let finalSystemPrompt = PERSONA_PROMPT; // Start with the persona prompt

    if (formattedContext.trim() !== '') {
      // Append formatted context if it exists
      finalSystemPrompt += `${formattedContext.trim()}\n\n---\n\n`; // Separator
    } else {
      // If no formatted context, add a note for clarity (Corrected Syntax)
      finalSystemPrompt += `(No specific global context relevant to this query was found or provided.)\n\n---\n\n`;
    }

    if (chatBehaviorPrompt.trim() !== '') {
      // Append per-chat instructions if they exist
      finalSystemPrompt += `Chat Behavior Instructions (Follow these in addition to the main persona):\n${chatBehaviorPrompt.trim()}`;
    }

    // Never use tools - always rely only on provided context
    const useTools = false;

    // Select the model from cookies or default
    const model = myProvider.languageModel(selectedChatModel);

    console.log(
      `[POST /api/chat] Calling AI. Use Tools: ${useTools}. System Prompt length: ${finalSystemPrompt.length}`,
    );
    // Add logging for the full prompt
    console.log('--- BEGIN FINAL SYSTEM PROMPT ---');
    console.log(finalSystemPrompt);
    console.log('--- END FINAL SYSTEM PROMPT ---');

    // Call streamText FIRST to get the result object
    const result = await streamText({
      model,
      messages,
      maxSteps: 5,
      experimental_transform: smoothStream({ chunking: 'word' }),
      experimental_generateMessageId: generateUUID,
      system: finalSystemPrompt.trim() || undefined,
      experimental_toolCallStreaming: useTools,
      onFinish: async ({ response }) => {
        if (session.user?.id) {
          try {
            const assistantId = getTrailingMessageId({
              messages: response.messages.filter(
                (message) => message.role === 'assistant',
              ),
            });

            if (!assistantId) {
              throw new Error('No assistant message found!');
            }

            const [, assistantMessage] = appendResponseMessages({
              messages: [message], // Use the single user message here
              responseMessages: response.messages,
            });

            await saveMessages({
              messages: [
                {
                  id: assistantId,
                  chatId: id,
                  role: assistantMessage.role,
                  parts: assistantMessage.parts,
                  attachments: assistantMessage.experimental_attachments ?? [],
                  createdAt: new Date(),
                },
              ],
            });
          } catch (_) {
            console.error('Failed to save chat');
          }
        }
      },
      experimental_telemetry: {
        isEnabled: isProductionEnvironment,
        functionId: 'stream-text',
      },
    });

    // Now, create the response stream and merge the result INSIDE the execute callback
    return createDataStreamResponse({
      execute: (dataStream) => {
        console.log(
          `[POST /api/chat] Merging stream into DataStream for chat ${id}`,
        );
        // Merge the result into the dataStream provided by the callback
        result.mergeIntoDataStream(dataStream, { sendReasoning: true });
      },
      onError: (error) => {
        console.error(
          `[POST /api/chat] Data stream error for chat ${id}:`,
          error,
        );
        return 'Oops, an error occurred!';
      },
    });
  } catch (error) {
    console.error(
      `[POST /api/chat] Unhandled error in POST handler for chat ${requestBody?.id}:`,
      error,
    );
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response('Forbidden', { status: 403 });
    }

    const deletedChat = await deleteChatById({ id });

    return Response.json(deletedChat, { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}
