import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  type SQL,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  user,
  chat,
  type User,
  document,
  type Suggestion,
  suggestion,
  message,
  vote,
  type DBMessage,
  type Chat,
  globalContext,
  enhancedContent,
  contentEntity,
  entityEnhancement,
  multimediaAttachment,
  type ContentEntity,
} from './schema';
import type { ArtifactKind } from '@/components/artifact';
import { generateUUID } from '../utils';
import { generateHashedPassword } from './utils';

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function getUser(email: string): Promise<Array<User>> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    console.error('Failed to get user from database');
    throw error;
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (error) {
    console.error('Failed to create user in database');
    throw error;
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    return await db.insert(user).values({ email, password }).returning({
      id: user.id,
      email: user.email,
    });
  } catch (error) {
    console.error('Failed to create guest user in database');
    throw error;
  }
}

export async function saveChat({
  id,
  userId,
  title,
  systemPrompt,
}: {
  id: string;
  userId: string;
  title: string;
  systemPrompt?: string | null;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      systemPrompt,
    });
  } catch (error) {
    console.error('Failed to save chat in database');
    throw error;
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (error) {
    console.error('Failed to delete chat by id from database');
    throw error;
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id),
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Array<Chat> = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new Error(`Chat with id ${startingAfter} not found`);
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new Error(`Chat with id ${endingBefore} not found`);
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    console.error('Failed to get chats by user from database');
    throw error;
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    console.error('Failed to get chat by id from database');
    throw error;
  }
}

export async function saveMessages({
  messages,
}: {
  messages: Array<DBMessage>;
}) {
  try {
    return await db.insert(message).values(messages);
  } catch (error) {
    console.error('Failed to save messages in database', error);
    throw error;
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    console.error('Failed to get messages by chat id from database', error);
    throw error;
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });
  } catch (error) {
    console.error('Failed to upvote message in database', error);
    throw error;
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    console.error('Failed to get votes by chat id from database', error);
    throw error;
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (error) {
    console.error('Failed to save document in database');
    throw error;
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    console.error('Failed to get document by id from database');
    throw error;
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    console.error('Failed to get document by id from database');
    throw error;
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp),
        ),
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (error) {
    console.error(
      'Failed to delete documents by id after timestamp from database',
    );
    throw error;
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (error) {
    console.error('Failed to save suggestions in database');
    throw error;
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(and(eq(suggestion.documentId, documentId)));
  } catch (error) {
    console.error(
      'Failed to get suggestions by document version from database',
    );
    throw error;
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    console.error('Failed to get message by id from database');
    throw error;
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds)),
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
  } catch (error) {
    console.error(
      'Failed to delete messages by id after timestamp from database',
    );
    throw error;
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    console.error('Failed to update chat visibility in database');
    throw error;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: { id: string; differenceInHours: number }) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000,
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, 'user'),
        ),
      )
      .execute();

    return stats?.count ?? 0;
  } catch (error) {
    console.error(
      'Failed to get message count by user id for the last 24 hours from database',
    );
    throw error;
  }
}

// ---- Global Context Queries ----

export async function getAllGlobalContext() {
  try {
    return await db
      .select()
      .from(globalContext)
      .orderBy(desc(globalContext.createdAt));
  } catch (error) {
    console.error('Failed to get all global context items from database');
    throw error;
  }
}

// New function to get only active items
export async function getAllActiveGlobalContext() {
  try {
    return await db
      .select()
      .from(globalContext)
      .where(eq(globalContext.isActive, true))
      .orderBy(desc(globalContext.createdAt));
  } catch (error) {
    console.error('Failed to get active global context items from database');
    throw error;
  }
}

export async function getGlobalContextById({ id }: { id: string }) {
  try {
    const [item] = await db
      .select()
      .from(globalContext)
      .where(eq(globalContext.id, id));
    return item;
  } catch (error) {
    console.error('Failed to get global context by id from database');
    throw error;
  }
}

export async function createGlobalContext({
  id,
  category,
  content,
  associatedHotels = ['all'],
  isActive = true,
}: {
  id: string;
  category: string;
  content: string;
  associatedHotels?: string[];
  isActive?: boolean;
}) {
  try {
    const [created] = await db
      .insert(globalContext)
      .values({
        id,
        category,
        content,
        associatedHotels,
        isActive,
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Failed to create global context in database');
    throw error;
  }
}

export async function updateGlobalContext({
  id,
  category,
  content,
  associatedHotels,
  isActive,
}: {
  id: string;
  category?: string;
  content?: string;
  associatedHotels?: string[];
  isActive?: boolean;
}) {
  try {
    const updateData: any = { updatedAt: new Date() };
    if (category !== undefined) updateData.category = category;
    if (content !== undefined) updateData.content = content;
    if (associatedHotels !== undefined)
      updateData.associatedHotels = associatedHotels;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(globalContext)
      .set(updateData)
      .where(eq(globalContext.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error('Failed to update global context in database');
    throw error;
  }
}

export async function deleteGlobalContext({ id }: { id: string }) {
  try {
    const [deleted] = await db
      .delete(globalContext)
      .where(eq(globalContext.id, id))
      .returning();
    return deleted;
  } catch (error) {
    console.error('Failed to delete global context from database');
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
    const [updated] = await db
      .update(globalContext)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(globalContext.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error('Failed to toggle global context active state in database');
    throw error;
  }
}

// New function to get unique categories from database
export async function getUniqueCategories() {
  try {
    const result = await db
      .selectDistinct({ category: globalContext.category })
      .from(globalContext)
      .orderBy(asc(globalContext.category));
    
    return result.map(item => item.category);
  } catch (error) {
    console.error('Failed to get unique categories from database');
    throw error;
  }
}

// ---- Content Enhancement System Queries ----

// Enhanced Content Queries
export async function createEnhancedContent({
  originalContentId,
  title,
  originalContent,
}: {
  originalContentId: string;
  title: string;
  originalContent: string;
}) {
  try {
    const [created] = await db
      .insert(enhancedContent)
      .values({
        originalContentId,
        title,
        originalContent,
        status: 'draft',
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Failed to create enhanced content in database');
    throw error;
  }
}

export async function getAllEnhancedContent() {
  try {
    return await db
      .select({
        id: enhancedContent.id,
        originalContentId: enhancedContent.originalContentId,
        title: enhancedContent.title,
        status: enhancedContent.status,
        createdAt: enhancedContent.createdAt,
        updatedAt: enhancedContent.updatedAt,
        originalTitle: globalContext.category,
      })
      .from(enhancedContent)
      .leftJoin(
        globalContext,
        eq(enhancedContent.originalContentId, globalContext.id),
      )
      .orderBy(desc(enhancedContent.updatedAt));
  } catch (error) {
    console.error('Failed to get all enhanced content from database');
    throw error;
  }
}

export async function getEnhancedContentById({ id }: { id: string }) {
  try {
    const [content] = await db
      .select()
      .from(enhancedContent)
      .where(eq(enhancedContent.id, id));
    return content;
  } catch (error) {
    console.error('Failed to get enhanced content by id from database');
    throw error;
  }
}

export async function updateEnhancedContent({
  id,
  enhancedContent: enhanced,
  status,
}: {
  id: string;
  enhancedContent?: string;
  status?: 'draft' | 'reviewing' | 'published';
}) {
  try {
    const updateData: any = { updatedAt: new Date() };
    if (enhanced !== undefined) updateData.enhancedContent = enhanced;
    if (status !== undefined) updateData.status = status;

    const [updated] = await db
      .update(enhancedContent)
      .set(updateData)
      .where(eq(enhancedContent.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error('Failed to update enhanced content in database');
    throw error;
  }
}

export async function deleteEnhancedContent({ id }: { id: string }) {
  try {
    const [deleted] = await db
      .delete(enhancedContent)
      .where(eq(enhancedContent.id, id))
      .returning();
    return deleted;
  } catch (error) {
    console.error('Failed to delete enhanced content from database');
    throw error;
  }
}

// Content Entity Queries
export async function createContentEntities({
  entities,
}: {
  entities: Array<Omit<ContentEntity, 'id' | 'createdAt' | 'updatedAt'>>;
}) {
  try {
    return await db.insert(contentEntity).values(entities).returning();
  } catch (error) {
    console.error('Failed to create content entities in database');
    throw error;
  }
}

export async function getEntitiesByEnhancedContentId({
  enhancedContentId,
}: {
  enhancedContentId: string;
}) {
  try {
    return await db
      .select()
      .from(contentEntity)
      .where(eq(contentEntity.enhancedContentId, enhancedContentId))
      .orderBy(asc(contentEntity.startPosition));
  } catch (error) {
    console.error(
      'Failed to get entities by enhanced content id from database',
    );
    throw error;
  }
}

export async function getEntityById({ id }: { id: string }) {
  try {
    const [entity] = await db
      .select()
      .from(contentEntity)
      .where(eq(contentEntity.id, id));
    return entity;
  } catch (error) {
    console.error('Failed to get entity by id from database');
    throw error;
  }
}

export async function updateContentEntity({
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
    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (metadata !== undefined) updateData.metadata = metadata;

    const [updated] = await db
      .update(contentEntity)
      .set(updateData)
      .where(eq(contentEntity.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error('Failed to update content entity in database');
    throw error;
  }
}

// Entity Enhancement Queries
export async function createEntityEnhancement({
  entityId,
  enhancementType,
  title,
  content,
  sortOrder = 0,
}: {
  entityId: string;
  enhancementType: string;
  title: string;
  content: string;
  sortOrder?: number;
}) {
  try {
    const [created] = await db
      .insert(entityEnhancement)
      .values({
        entityId,
        enhancementType,
        title,
        content,
        sortOrder,
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Failed to create entity enhancement in database');
    throw error;
  }
}

export async function getEnhancementsByEntityId({
  entityId,
}: {
  entityId: string;
}) {
  try {
    return await db
      .select()
      .from(entityEnhancement)
      .where(eq(entityEnhancement.entityId, entityId))
      .orderBy(
        asc(entityEnhancement.sortOrder),
        asc(entityEnhancement.createdAt),
      );
  } catch (error) {
    console.error('Failed to get enhancements by entity id from database');
    throw error;
  }
}

export async function updateEntityEnhancement({
  id,
  title,
  content,
  sortOrder,
}: {
  id: string;
  title?: string;
  content?: string;
  sortOrder?: number;
}) {
  try {
    const updateData: any = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    const [updated] = await db
      .update(entityEnhancement)
      .set(updateData)
      .where(eq(entityEnhancement.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error('Failed to update entity enhancement in database');
    throw error;
  }
}

export async function deleteEntityEnhancement({ id }: { id: string }) {
  try {
    const [deleted] = await db
      .delete(entityEnhancement)
      .where(eq(entityEnhancement.id, id))
      .returning();
    return deleted;
  } catch (error) {
    console.error('Failed to delete entity enhancement from database');
    throw error;
  }
}

// Multimedia Attachment Queries
export async function createMultimediaAttachment({
  entityId,
  type,
  filename,
  originalFilename,
  url,
  size,
  mimeType,
  altText,
  caption,
  metadata = {},
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
  metadata?: any;
}) {
  try {
    const [created] = await db
      .insert(multimediaAttachment)
      .values({
        entityId,
        type,
        filename,
        originalFilename,
        url,
        size,
        mimeType,
        altText,
        caption,
        metadata,
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Failed to create multimedia attachment in database');
    throw error;
  }
}

export async function getAttachmentsByEntityId({
  entityId,
}: {
  entityId: string;
}) {
  try {
    return await db
      .select()
      .from(multimediaAttachment)
      .where(eq(multimediaAttachment.entityId, entityId))
      .orderBy(asc(multimediaAttachment.createdAt));
  } catch (error) {
    console.error('Failed to get attachments by entity id from database');
    throw error;
  }
}

export async function deleteMultimediaAttachment({ id }: { id: string }) {
  try {
    const [deleted] = await db
      .delete(multimediaAttachment)
      .where(eq(multimediaAttachment.id, id))
      .returning();
    return deleted;
  } catch (error) {
    console.error('Failed to delete multimedia attachment from database');
    throw error;
  }
}

// Combined queries for full entity data with enhancements and attachments
export async function getFullEntityData({ entityId }: { entityId: string }) {
  try {
    const entity = await getEntityById({ id: entityId });
    if (!entity) return null;

    const enhancements = await getEnhancementsByEntityId({ entityId });
    const attachments = await getAttachmentsByEntityId({ entityId });

    return {
      entity,
      enhancements,
      attachments,
    };
  } catch (error) {
    console.error('Failed to get full entity data from database');
    throw error;
  }
}

export async function getFullEnhancedContentData({
  enhancedContentId,
}: {
  enhancedContentId: string;
}) {
  try {
    const content = await getEnhancedContentById({ id: enhancedContentId });
    if (!content) return null;

    const entities = await getEntitiesByEnhancedContentId({
      enhancedContentId,
    });

    // Get enhancements and attachments for each entity
    const entitiesWithData = await Promise.all(
      entities.map(async (entity) => {
        const enhancements = await getEnhancementsByEntityId({
          entityId: entity.id,
        });
        const attachments = await getAttachmentsByEntityId({
          entityId: entity.id,
        });
        return {
          ...entity,
          enhancements,
          attachments,
        };
      }),
    );

    return {
      content,
      entities: entitiesWithData,
    };
  } catch (error) {
    console.error('Failed to get full enhanced content data from database');
    throw error;
  }
}
