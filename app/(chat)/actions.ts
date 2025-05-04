'use server';

import 'server-only';

import { generateText, type UIMessage } from 'ai';
import { cookies } from 'next/headers';
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
  getGlobalContextById,
} from '@/lib/db/queries';
import type { VisibilityType } from '@/components/visibility-selector';
import { myProvider } from '@/lib/ai/providers';
import { eq } from 'drizzle-orm';
import { chat, globalContext } from '@/lib/db/schema';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import cuid from 'cuid';

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
  isActive = true,
  associatedHotels = ['all'], // Default to 'all' if not provided
}: {
  category: string;
  content: string;
  isActive?: boolean;
  associatedHotels?: string[]; // Added associatedHotels parameter
}) {
  try {
    const newId = cuid();
    await db
      .insert(globalContext)
      .values({ id: newId, category, content, isActive, associatedHotels });
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
  isActive,
  associatedHotels, // Added associatedHotels parameter (required for update)
}: {
  id: string;
  category: string;
  content: string;
  isActive: boolean;
  associatedHotels: string[]; // Now required
}) {
  try {
    await db
      .update(globalContext)
      // Added associatedHotels to the set clause
      .set({
        category,
        content,
        isActive,
        associatedHotels,
        updatedAt: new Date(),
      })
      .where(eq(globalContext.id, id));
    // Consider revalidating cache/path
  } catch (error) {
    console.error('Failed to update global context item');
    throw error;
  }
}

export async function toggleGlobalContextActive({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  try {
    await db
      .update(globalContext)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(globalContext.id, id));
    // Consider revalidating cache/path
  } catch (error) {
    console.error('Failed to toggle global context active state');
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

// ---- Refactor Context Action ----

// Define the prompt for refactoring - MORE GENERIC & PREVENTS HALLUCINATION
const REFACTOR_PROMPT = `Refactor the following content STRICTLY for better readability by an LLM. Your primary goal is to preserve ALL factual information (names, numbers, dates, features, policies, locations, contacts, capacities, dimensions, included services, charges, timings, etc.) exactly as presented in the original text. Your secondary goal is to improve structure using markdown based *only* on the provided content.

Follow these rules precisely:
1.  **Preserve Facts:** DO NOT omit, summarize, interpret, or change any factual details found in the original text. If unsure if something is purely promotional or factual, KEEP IT.
2.  **Do Not Add Information:** DO NOT add any information, sections, examples, or placeholders that are not explicitly present in the original content chunk provided below. Only reformat the existing text.
3.  **Markdown Structure:**
    *   Use appropriate markdown heading levels (e.g., \`##\`, \`###\`, \`####\`) based on the logical hierarchy found *within the provided content*. Do not invent sections.
    *   Use bullet points (\`-\` or \`*\`) for lists of features or items found in the text.
    *   Enclose ALL tabular data or highly structured lists (like price lists, schedules, specification tables, policy blocks) found in the text within markdown code blocks (\`\`\`) to preserve formatting and clearly signal structured data. Ensure the content inside the code blocks maintains its original structure/alignment as much as possible.
4.  **Promotional Text (Low Priority):** You MAY remove sentences that are PURELY promotional marketing language (e.g., "Experience unparalleled luxury...", "A symphony of flavors awaits...") ONLY IF they contain NO specific factual information. If a sentence mixes promotion with facts, KEEP the entire sentence. Preserving facts is more important than removing fluff.
5.  **Formatting:** Maintain bold text where used in the original for emphasis. Do not add new formatting other than the specified markdown.`;

export async function refactorGlobalContext({
  contextId,
}: { contextId: string }) {
  try {
    console.log(`[Refactor Action] Starting refactor for ID: ${contextId}`);
    // 1. Fetch the original item
    const originalItem = await getGlobalContextById({ id: contextId });
    if (!originalItem || !originalItem.content) {
      throw new Error('Original context item not found or has no content.');
    }
    console.log(
      `[Refactor Action] Fetched original content (length: ${originalItem.content.length})`,
    );

    // 2. Split content into chunks based on "## " headings
    // We add a dummy heading at the start to ensure the first part is captured
    const chunks = `## Dummy Start\\n${originalItem.content}`
      .split(/^## /m) // Split by lines starting with "## "
      .filter((chunk) => chunk.trim() !== '') // Remove empty chunks
      .map((chunk, index) =>
        index > 0 ? `## ${chunk}` : chunk.replace('## Dummy Start\\n', ''),
      ); // Re-add "## " to subsequent chunks and clean the first

    console.log(
      `[Refactor Action] Split content into ${chunks.length} chunks.`,
    );

    if (chunks.length === 0) {
      throw new Error('Splitting content resulted in zero chunks.');
    }

    const refactoredChunks: string[] = [];

    // 3. Iterate and refactor each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(
        `[Refactor Action] Processing chunk ${i + 1}/${chunks.length} (length: ${chunk.length})`,
      );

      // Prepare prompt for the current chunk
      // Note: We append the chunk content after the REFACTOR_PROMPT
      const promptForModel = `${REFACTOR_PROMPT}\\n\\nOriginal Content Chunk:\\n---\\n${chunk}`;

      console.log(
        `[Refactor Action] Calling generateText for chunk ${i + 1} with model gpt-4o`,
      );
      // Ensure 'await' is used correctly here
      const { text: refactoredChunk } = await generateText({
        model: openai('gpt-4o'),
        prompt: promptForModel,
      });
      console.log(
        `[Refactor Action] Received refactored chunk ${i + 1} (length: ${refactoredChunk.length})`,
      );

      if (!refactoredChunk || refactoredChunk.trim() === '') {
        console.warn(
          `[Refactor Action] Warning: Refactoring chunk ${i + 1} resulted in empty content. Skipping chunk.`,
        );
        // Optionally keep the original chunk if refactoring fails?
        // refactoredChunks.push(chunk);
      } else {
        refactoredChunks.push(refactoredChunk.trim());
      }
    }

    // 4. Combine refactored chunks
    const finalRefactoredContent = refactoredChunks.join('\\n\\n'); // Add spacing between chunks
    console.log(
      `[Refactor Action] Combined refactored content (length: ${finalRefactoredContent.length})`,
    );

    if (finalRefactoredContent.trim() === '') {
      throw new Error('Combined refactored content is empty.');
    }

    // 5. Update the item with the combined refactored content
    console.log(`[Refactor Action] Updating context item ${contextId}`);
    // Ensure 'await' is used correctly here
    await updateGlobalContext({
      id: originalItem.id,
      category: originalItem.category, // Keep original category
      content: finalRefactoredContent, // Save combined refactored content
      isActive: originalItem.isActive, // Keep original active state
      // Pass existing associatedHotels during refactor update
      associatedHotels: originalItem.associatedHotels || ['all'],
    });
    console.log(
      `[Refactor Action] Successfully updated context item ${contextId}`,
    );

    return { success: true };
  } catch (error) {
    console.error(`[Refactor Action] Failed for ID ${contextId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
