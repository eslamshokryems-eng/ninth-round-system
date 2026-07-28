import type { Result } from "./result";

/**
 * The shape every bounded context's repository ports follow. Defined in
 * `domain/` per context (e.g. `packages/training/domain/program-repository.ts`)
 * and implemented in that same context's `infrastructure/` layer against
 * Supabase — never imported directly by a use case's caller. See
 * docs/13-ddd-architecture.md.
 */
export interface Repository<TEntity, TId extends string = string> {
  findById(id: TId): Promise<Result<TEntity | null>>;
  save(entity: TEntity): Promise<Result<void>>;
}
