import type { InferSelectModel } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  boolean,
  pgTable,
  text,
  timestamp,
  varchar,
  uuid,
  primaryKey,
  foreignKey,
  json,
  integer,
  decimal,
} from 'drizzle-orm/pg-core';

export const user = pgTable('User', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  email: varchar('email', { length: 64 }).notNull(),
  password: varchar('password', { length: 64 }),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable('Chat', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  createdAt: timestamp('createdAt').notNull(),
  title: text('title').notNull(),
  userId: uuid('userId')
    .notNull()
    .references(() => user.id),
  visibility: varchar('visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('private'),
  systemPrompt: text('systemPrompt'),
});

export type Chat = InferSelectModel<typeof chat>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://github.com/vercel/ai-chatbot/blob/main/docs/04-migrate-to-parts.md
export const messageDeprecated = pgTable('Message', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  role: varchar('role').notNull(),
  content: json('content').notNull(),
  createdAt: timestamp('createdAt').notNull(),
});

export type MessageDeprecated = InferSelectModel<typeof messageDeprecated>;

export const message = pgTable('Message_v2', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  role: varchar('role').notNull(),
  parts: json('parts').notNull(),
  attachments: json('attachments').notNull(),
  createdAt: timestamp('createdAt').notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://github.com/vercel/ai-chatbot/blob/main/docs/04-migrate-to-parts.md
export const voteDeprecated = pgTable(
  'Vote',
  {
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id),
    messageId: uuid('messageId')
      .notNull()
      .references(() => messageDeprecated.id),
    isUpvoted: boolean('isUpvoted').notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type VoteDeprecated = InferSelectModel<typeof voteDeprecated>;

export const vote = pgTable(
  'Vote_v2',
  {
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id),
    messageId: uuid('messageId')
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean('isUpvoted').notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  'Document',
  {
    id: uuid('id').notNull().defaultRandom(),
    createdAt: timestamp('createdAt').notNull(),
    title: text('title').notNull(),
    content: text('content'),
    kind: varchar('text', { enum: ['text', 'code', 'image', 'sheet'] })
      .notNull()
      .default('text'),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  },
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  'Suggestion',
  {
    id: uuid('id').notNull().defaultRandom(),
    documentId: uuid('documentId').notNull(),
    documentCreatedAt: timestamp('documentCreatedAt').notNull(),
    originalText: text('originalText').notNull(),
    suggestedText: text('suggestedText').notNull(),
    description: text('description'),
    isResolved: boolean('isResolved').notNull().default(false),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('createdAt').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  }),
);

export type Suggestion = InferSelectModel<typeof suggestion>;

// New table for global context
export const globalContext = pgTable('global_context', {
  id: varchar('id', { length: 191 }).primaryKey(),
  category: text('category').notNull(),
  content: text('content').notNull(),
  associatedHotels: text('associated_hotels')
    .array()
    .default(sql`'{}'::text[]`)
    .notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type GlobalContext = InferSelectModel<typeof globalContext>;

// Content Enhancement System Tables

// Enhanced Content - stores processed and enriched content
export const enhancedContent = pgTable('enhanced_content', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  originalContentId: varchar('original_content_id', { length: 191 })
    .notNull()
    .references(() => globalContext.id),
  title: text('title').notNull(),
  originalContent: text('original_content').notNull(),
  enhancedContent: text('enhanced_content'),
  status: varchar('status', { enum: ['draft', 'reviewing', 'published'] })
    .notNull()
    .default('draft'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type EnhancedContent = InferSelectModel<typeof enhancedContent>;

// Entities - stores parsed entities from content analysis
export const contentEntity = pgTable('content_entity', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  enhancedContentId: uuid('enhanced_content_id')
    .notNull()
    .references(() => enhancedContent.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(), // e.g., 'restaurant', 'service', 'location', 'product'
  name: text('name').notNull(),
  description: text('description'),
  originalText: text('original_text').notNull(), // The text span from original content
  startPosition: integer('start_position'), // Character position in original content
  endPosition: integer('end_position'), // Character position in original content
  confidence: decimal('confidence', { precision: 3, scale: 2 }), // AI confidence score
  metadata: json('metadata').default('{}'), // Additional structured data about the entity
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type ContentEntity = InferSelectModel<typeof contentEntity>;

// Entity Enhancements - stores user-added enhancements to entities
export const entityEnhancement = pgTable('entity_enhancement', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  entityId: uuid('entity_id')
    .notNull()
    .references(() => contentEntity.id, { onDelete: 'cascade' }),
  enhancementType: varchar('enhancement_type', { length: 50 }).notNull(), // e.g., 'description', 'hours', 'contact', 'pricing'
  title: text('title').notNull(),
  content: text('content').notNull(),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type EntityEnhancement = InferSelectModel<typeof entityEnhancement>;

// Multimedia Attachments - stores multimedia associated with entities
export const multimediaAttachment = pgTable('multimedia_attachment', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  entityId: uuid('entity_id')
    .notNull()
    .references(() => contentEntity.id, { onDelete: 'cascade' }),
  type: varchar('type', {
    enum: ['image', 'video', 'audio', 'document'],
  }).notNull(),
  filename: text('filename').notNull(),
  originalFilename: text('original_filename'),
  url: text('url'), // File URL or path
  size: integer('size'), // File size in bytes
  mimeType: varchar('mime_type', { length: 100 }),
  altText: text('alt_text'), // For accessibility
  caption: text('caption'),
  metadata: json('metadata').default('{}'), // Additional file metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type MultimediaAttachment = InferSelectModel<
  typeof multimediaAttachment
>;
