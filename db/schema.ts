import { sqliteTable, text, integer,real,primaryKey,index } from 'drizzle-orm/sqlite-core';
export const accounts = sqliteTable('accounts', {userId:text('user_id').primaryKey(),encryptedKey:text('encrypted_key'),settings:text('settings').notNull()});
export const budgets = sqliteTable('budgets', {id:text('id').primaryKey(),used:integer('used').notNull().default(0),usedCny:integer('used_cny')});
export const calls = sqliteTable('calls', {id:text('id').primaryKey(),userId:text('user_id').notNull(),model:text('model').notNull(),status:text('status').notNull(),charged:integer('charged').notNull(),chargedCny:integer('charged_cny'),at:text('at').notNull()});
export const providerKeys=sqliteTable('provider_keys',{userId:text('user_id').notNull(),provider:text('provider').notNull(),encryptedKey:text('encrypted_key').notNull()},t=>[primaryKey({columns:[t.userId,t.provider]})]);
export const directModels=sqliteTable('direct_models',{id:text('id').notNull(),userId:text('user_id').notNull(),provider:text('provider').notNull(),modelId:text('model_id').notNull(),name:text('name').notNull(),inputUsd:real('input_usd').notNull(),outputUsd:real('output_usd').notNull(),contextLength:integer('context_length').notNull()},t=>[primaryKey({columns:[t.userId,t.id]})]);
export const requests=sqliteTable('requests',{id:text('id').primaryKey(),userId:text('user_id').notNull(),status:text('status').notNull(),payload:text('payload').notNull(),estimate:text('estimate').notNull(),result:text('result'),createdAt:text('created_at').notNull(),expiresAt:text('expires_at').notNull()},t=>[index('requests_owner').on(t.userId,t.createdAt)]);

export const officialPricing=sqliteTable('official_pricing',{id:text('id').primaryKey(),payload:text('payload'),fetchedAt:text('fetched_at'),attemptedAt:text('attempted_at').notNull(),error:text('error')});

export const pricingPolicy=sqliteTable('pricing_policy',{id:integer('id').primaryKey(),autoUpdate:integer('auto_update').notNull().default(1),refreshHours:integer('refresh_hours').notNull().default(24)});
