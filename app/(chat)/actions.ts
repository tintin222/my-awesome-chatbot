'use server';

import 'server-only';

import { generateText, type UIMessage } from 'ai';
import { cookies } from 'next/headers';
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
} from '@/lib/db/queries';
import type { VisibilityType } from '@/components/visibility-selector';
import { myProvider } from '@/lib/ai/providers';
import { eq } from 'drizzle-orm';
import { chat, globalContext } from '@/lib/db/schema';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Initialize db instance here
// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('chat-model', model);
}

export async function updateChatSystemPrompt({
  chatId,
  prompt,
}: {
  chatId: string;
  prompt: string;
}) {
  try {
    await db
      .update(chat)
      .set({ systemPrompt: prompt })
      .where(eq(chat.id, chatId));
  } catch (error) {
    console.error('Failed to update chat system prompt in database');
    // Optionally re-throw or handle error for the UI
    throw error;
  }
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  const { text: title } = await generateText({
    model: myProvider.languageModel('title-model'),
    system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons`,
    prompt: JSON.stringify(message),
  });

  return title;
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await updateChatVisiblityById({ chatId, visibility });
}

// ---- Global Context Actions ----

export async function createGlobalContext({
  category,
  content,
}: {
  category: string;
  content: string;
}) {
  try {
    await db.insert(globalContext).values({ category, content });
    // Consider revalidating cache/path if using a dedicated management page
  } catch (error) {
    console.error('Failed to create global context item');
    throw error;
  }
}

export async function updateGlobalContext({
  id,
  category,
  content,
}: {
  id: string;
  category: string;
  content: string;
}) {
  try {
    await db
      .update(globalContext)
      .set({ category, content, updatedAt: new Date() })
      .where(eq(globalContext.id, id));
    // Consider revalidating cache/path
  } catch (error) {
    console.error('Failed to update global context item');
    throw error;
  }
}

export async function deleteGlobalContext({ id }: { id: string }) {
  try {
    await db.delete(globalContext).where(eq(globalContext.id, id));
    // Consider revalidating cache/path
  } catch (error) {
    console.error('Failed to delete global context item');
    throw error;
  }
}
