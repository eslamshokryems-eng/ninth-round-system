/**
 * Every bounded context's aggregates raise domain events instead of calling
 * into other contexts directly — this is what keeps `training` from
 * importing `notifications` just to say "a workout finished, maybe notify
 * someone." The event is persisted to the `domain_events` table (see
 * supabase/migrations/20260801000001_extensions_and_enums.sql) by
 * infrastructure, which is also the single feed AI features read from
 * (docs/04-database-schema.md §4.7, requirement: "every feature must
 * support future AI integration").
 */
export interface DomainEvent<TPayload = Record<string, unknown>> {
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly profileId: string | null;
  readonly payload: TPayload;
  readonly occurredAt: Date;
}

export function createDomainEvent<TPayload extends Record<string, unknown>>(params: {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  profileId: string | null;
  payload: TPayload;
}): DomainEvent<TPayload> {
  return { ...params, occurredAt: new Date() };
}

/**
 * An aggregate root collects the events it raised during a use case so
 * infrastructure can persist them in the same transaction as the aggregate's
 * own state change, then clear them once dispatched.
 */
export abstract class AggregateRoot<TId extends string = string> {
  private readonly _domainEvents: DomainEvent[] = [];

  protected constructor(public readonly id: TId) {}

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  public pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents.length = 0;
    return events;
  }
}
