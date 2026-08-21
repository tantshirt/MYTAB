/* eslint-disable */
/**
 * Generated data model types.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev` or `npx convex codegen`.
 * This stub exists so builds succeed without a linked Convex deployment.
 */
import type {
  DataModelFromSchemaDefinition,
  DocumentByName,
  TableNamesInDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";
import schema from "../schema.js";

type SchemaDataModel = DataModelFromSchemaDefinition<typeof schema>;

export type TableNames = TableNamesInDataModel<SchemaDataModel>;
export type Doc<TableName extends TableNames> = DocumentByName<SchemaDataModel, TableName>;
export type Id<TableName extends TableNames = TableNames> = GenericId<TableName>;
export type DataModel = SchemaDataModel;
