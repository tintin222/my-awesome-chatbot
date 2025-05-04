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
    let chatCheck = await getChatById({ id });

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

    const allGlobalContext = await getAllGlobalContext();
    const activeGlobalContext = allGlobalContext.filter(
      (item) => item.isActive,
    );
    let formattedGlobalContext = '';
    if (activeGlobalContext && activeGlobalContext.length > 0) {
      formattedGlobalContext = '\n\n--- Global Context ---\n';
      const grouped = activeGlobalContext.reduce(
        (acc, item) => {
          acc[item.category] = acc[item.category] || [];
          acc[item.category].push(item.content);
          return acc;
        },
        {} as Record<string, string[]>,
      );

      for (const category in grouped) {
        formattedGlobalContext += `\n### ${category}\n`;
        formattedGlobalContext += grouped[category].join('\n---\n');
        formattedGlobalContext += '\n';
      }
      formattedGlobalContext += '\n----------------------\n';
    }

    const chatBehaviorPrompt = savedChat?.systemPrompt || '';
    console.log(
      `[POST /api/chat] Per-chat behavior prompt length: ${chatBehaviorPrompt.length}`,
    );

    return createDataStreamResponse({
      execute: (dataStream) => {
        console.log(`[POST /api/chat] Execute stream for chat ${id}`);
        try {
          const streamOptions: Parameters<typeof streamText>[0] = {
            model: myProvider.languageModel(selectedChatModel),
            messages,
            maxSteps: 5,
            experimental_transform: smoothStream({ chunking: 'word' }),
            experimental_generateMessageId: generateUUID,
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
                    messages: [message],
                    responseMessages: response.messages,
                  });

                  await saveMessages({
                    messages: [
                      {
                        id: assistantId,
                        chatId: id,
                        role: assistantMessage.role,
                        parts: assistantMessage.parts,
                        attachments:
                          assistantMessage.experimental_attachments ?? [],
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
          };

          const finalSystemPrompt =
            `${formattedGlobalContext}${chatBehaviorPrompt}`.trim();
          let useTools = false;

          if (finalSystemPrompt) {
            streamOptions.system = finalSystemPrompt;
            console.log(
              `[POST /api/chat] Using combined system prompt (length: ${finalSystemPrompt.length}), tools disabled.`,
            );
          } else {
            useTools = true;
            streamOptions.system = systemPrompt({
              selectedChatModel,
              requestHints,
            });
            streamOptions.experimental_activeTools =
              selectedChatModel === 'chat-model-reasoning'
                ? []
                : [
                    'getWeather',
                    'createDocument',
                    'updateDocument',
                    'requestSuggestions',
                  ];
            streamOptions.tools = {
              getWeather,
              createDocument: createDocument({ session, dataStream }),
              updateDocument: updateDocument({ session, dataStream }),
              requestSuggestions: requestSuggestions({
                session,
                dataStream,
              }),
            };
            console.log(
              `[POST /api/chat] Using default system prompt, tools enabled.`,
            );
          }

          console.log('[POST /api/chat] Calling streamText with options:', {
            model: streamOptions.model,
            systemLength: streamOptions.system?.length,
            toolsEnabled: useTools,
          });
          const result = streamText(streamOptions);
          console.log(
            `[POST /api/chat] streamText call initiated for chat ${id}`,
          );

          result.consumeStream();
          result.mergeIntoDataStream(dataStream, { sendReasoning: true });
          console.log(
            `[POST /api/chat] Stream merging initiated for chat ${id}`,
          );
        } catch (streamError) {
          console.error(
            `[POST /api/chat] Error during stream execution for chat ${id}:`,
            streamError,
          );
          throw streamError;
        }
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
