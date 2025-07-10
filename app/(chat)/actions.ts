'use server';

import 'server-only';

import { generateText, type UIMessage } from 'ai';
import { cookies } from 'next/headers';
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
  getGlobalContextById,
  createEnhancedContent,
  getAllEnhancedContent,
  updateEnhancedContent,
  deleteEnhancedContent,
  createContentEntities,
  updateContentEntity,
  createEntityEnhancement,
  updateEntityEnhancement,
  deleteEntityEnhancement,
  createMultimediaAttachment,
  deleteMultimediaAttachment,
  getFullEnhancedContentData,
  getAllGlobalContext,
} from '../../lib/db/queries';
import type { VisibilityType } from '../../components/visibility-selector';
import { myProvider } from '../../lib/ai/providers';
import { eq } from 'drizzle-orm';
import { chat, globalContext } from '../../lib/db/schema';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
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

// ---- Content Enhancement System Actions ----

// AI-powered content analysis function
export async function analyzeContentAndExtractEntities({
  content,
}: {
  content: string;
}) {
  try {
    console.log('[Analyze Content] Starting content analysis');

    const analysisPrompt = `Analyze the following content and extract structured entities. Return ONLY a valid JSON array of entities with the following structure for each entity (no markdown formatting, no code blocks, just pure JSON):

{
  "type": "restaurant|service|location|product|facility|event|policy|contact|pricing|amenity",
  "name": "Entity name",
  "description": "Brief description of the entity",
  "originalText": "The exact text span from the original content",
  "startPosition": number,
  "endPosition": number,
  "confidence": number (0.0 to 1.0),
  "metadata": {
    // Additional structured data specific to the entity type
    // For restaurants: cuisine, location, capacity, etc.
    // For services: hours, pricing, contact, etc.
    // For facilities: location, capacity, amenities, etc.
  }
}

Focus on extracting:
- Restaurant and dining entities with details like cuisine, location, hours
- Hotel services and amenities
- Facilities and their features
- Contact information and policies
- Pricing and booking information
- Events and activities
- Location and geographic information

Be precise with startPosition and endPosition (character indices in the original text).
Only extract entities that have clear, useful information.
Assign confidence scores based on how clearly defined and useful the entity is.

IMPORTANT: Return ONLY the JSON array, no explanations, no markdown, no code blocks.

Content to analyze:
---
${content}`;

    const { text: analysisResult } = await generateText({
      model: myProvider.languageModel('gemini-2.5-pro-preview'),
      prompt: analysisPrompt,
    });

    console.log('[Analyze Content] Received analysis result');

    // Clean the response to handle markdown code blocks
    let cleanedResult = analysisResult.trim();

    // Remove markdown code blocks if present
    if (cleanedResult.startsWith('```json')) {
      cleanedResult = cleanedResult
        .replace(/^```json\s*/, '')
        .replace(/\s*```$/, '');
    } else if (cleanedResult.startsWith('```')) {
      cleanedResult = cleanedResult
        .replace(/^```\s*/, '')
        .replace(/\s*```$/, '');
    }

    console.log(
      '[Analyze Content] Cleaned result length:',
      cleanedResult.length,
    );

    // Parse the JSON response
    let entities: any[];
    try {
      entities = JSON.parse(cleanedResult);
    } catch (parseError) {
      console.error('[Analyze Content] Failed to parse JSON:', parseError);
      console.error('[Analyze Content] Raw result:', analysisResult);
      console.error('[Analyze Content] Cleaned result:', cleanedResult);
      throw new Error('Failed to parse AI analysis result');
    }

    if (!Array.isArray(entities)) {
      throw new Error('AI analysis did not return a valid array of entities');
    }

    console.log(`[Analyze Content] Extracted ${entities.length} entities`);
    return { entities, success: true };
  } catch (error) {
    console.error('[Analyze Content] Failed:', error);
    return {
      entities: [],
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Create enhanced content from global context
export async function createEnhancedContentFromContext({
  originalContentId,
}: {
  originalContentId: string;
}) {
  try {
    console.log(
      `[Create Enhanced] Starting for context ID: ${originalContentId}`,
    );

    // Get the original global context
    const originalContext = await getGlobalContextById({
      id: originalContentId,
    });
    if (!originalContext) {
      throw new Error('Original context not found');
    }

    // Create enhanced content record
    const enhancedContent = await createEnhancedContent({
      originalContentId,
      title: `Enhanced: ${originalContext.category}`,
      originalContent: originalContext.content,
    });

    console.log(
      `[Create Enhanced] Created enhanced content: ${enhancedContent.id}`,
    );

    // Analyze content and extract entities
    const analysisResult = await analyzeContentAndExtractEntities({
      content: originalContext.content,
    });

    if (!analysisResult.success) {
      throw new Error(`Content analysis failed: ${analysisResult.error}`);
    }

    // Create entity records
    if (analysisResult.entities.length > 0) {
      const entityRecords = analysisResult.entities.map(
        (entity: {
          type: string;
          name: string;
          description: string;
          originalText: string;
          startPosition: number;
          endPosition: number;
          confidence: number;
          metadata: any;
        }) => ({
          enhancedContentId: enhancedContent.id,
          type: entity.type,
          name: entity.name,
          description: entity.description,
          originalText: entity.originalText,
          startPosition: entity.startPosition,
          endPosition: entity.endPosition,
          confidence: String(entity.confidence), // Convert to string for decimal type
          metadata: entity.metadata || {},
        }),
      );

      await createContentEntities({ entities: entityRecords });
      console.log(
        `[Create Enhanced] Created ${entityRecords.length} entity records`,
      );
    }

    return { success: true, enhancedContentId: enhancedContent.id };
  } catch (error) {
    console.error('[Create Enhanced] Failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Get all enhanced content items
export async function getEnhancedContentList() {
  try {
    return await getAllEnhancedContent();
  } catch (error) {
    console.error('Failed to get enhanced content list');
    throw error;
  }
}

// Get full enhanced content data with entities
export async function getEnhancedContentWithEntities({
  enhancedContentId,
}: {
  enhancedContentId: string;
}) {
  try {
    return await getFullEnhancedContentData({ enhancedContentId });
  } catch (error) {
    console.error('Failed to get enhanced content with entities');
    throw error;
  }
}

// Add enhancement to entity
export async function addEntityEnhancement({
  entityId,
  enhancementType,
  title,
  content,
}: {
  entityId: string;
  enhancementType: string;
  title: string;
  content: string;
}) {
  try {
    return await createEntityEnhancement({
      entityId,
      enhancementType,
      title,
      content,
    });
  } catch (error) {
    console.error('Failed to add entity enhancement');
    throw error;
  }
}

// Update entity enhancement
export async function updateEntityEnhancementAction({
  id,
  title,
  content,
}: {
  id: string;
  title?: string;
  content?: string;
}) {
  try {
    return await updateEntityEnhancement({ id, title, content });
  } catch (error) {
    console.error('Failed to update entity enhancement');
    throw error;
  }
}

// Delete entity enhancement
export async function deleteEntityEnhancementAction({ id }: { id: string }) {
  try {
    return await deleteEntityEnhancement({ id });
  } catch (error) {
    console.error('Failed to delete entity enhancement');
    throw error;
  }
}

// Update entity basic info
export async function updateEntityAction({
  id,
  name,
  description,
  metadata,
}: {
  id: string;
  name?: string;
  description?: string;
  metadata?: any;
}) {
  try {
    return await updateContentEntity({ id, name, description, metadata });
  } catch (error) {
    console.error('Failed to update entity');
    throw error;
  }
}

// Add multimedia attachment to entity
export async function addMultimediaToEntity({
  entityId,
  type,
  filename,
  originalFilename,
  url,
  size,
  mimeType,
  altText,
  caption,
}: {
  entityId: string;
  type: 'image' | 'video' | 'audio' | 'document';
  filename: string;
  originalFilename?: string;
  url?: string;
  size?: number;
  mimeType?: string;
  altText?: string;
  caption?: string;
}) {
  try {
    return await createMultimediaAttachment({
      entityId,
      type,
      filename,
      originalFilename,
      url,
      size,
      mimeType,
      altText,
      caption,
    });
  } catch (error) {
    console.error('Failed to add multimedia attachment');
    throw error;
  }
}

// Delete multimedia attachment
export async function deleteMultimediaAttachmentAction({ id }: { id: string }) {
  try {
    return await deleteMultimediaAttachment({ id });
  } catch (error) {
    console.error('Failed to delete multimedia attachment');
    throw error;
  }
}

// Delete enhanced content
export async function deleteEnhancedContentAction({ id }: { id: string }) {
  try {
    return await deleteEnhancedContent({ id });
  } catch (error) {
    console.error('Failed to delete enhanced content');
    throw error;
  }
}

// Update enhanced content status
export async function updateEnhancedContentStatus({
  id,
  status,
}: {
  id: string;
  status: 'draft' | 'reviewing' | 'published';
}) {
  try {
    return await updateEnhancedContent({ id, status });
  } catch (error) {
    console.error('Failed to update enhanced content status');
    throw error;
  }
}

// Get available global context for content enhancement
export async function getAvailableContextForEnhancement() {
  try {
    const allContext = await getAllGlobalContext();
    const enhancedContent = await getAllEnhancedContent();

    // Filter out context that already has enhanced content
    const enhancedContentIds = new Set(
      enhancedContent.map((ec) => ec.originalContentId),
    );
    const availableContext = allContext.filter(
      (context) => !enhancedContentIds.has(context.id),
    );

    return availableContext;
  } catch (error) {
    console.error('Failed to get available context for enhancement');
    throw error;
  }
}
