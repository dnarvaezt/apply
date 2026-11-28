import type {
  ChangeSource,
  DiscardReason,
  MoveStatusRequest,
  StatusChange,
  VacancyProcess,
  VacancyStatus,
} from "@apply/shared";
import { desc, eq } from "drizzle-orm";
import { channels, vacancies, vacancyStatusChanges } from "#db";
import { listVacancyContacts } from "../contacts/repository.ts";
import type { Executor } from "../db.ts";
import { formatId, parseId } from "../ids.ts";
import { advancesAutomatically, moveError } from "./rules.ts";

/** Movimiento inválido (regla, canal desconocido): la ruta responde 400. */
export class InvalidMoveError extends Error {}

interface Change {
  to: VacancyStatus;
  discardReason: DiscardReason | null;
  note: string | null;
  channel: string | null;
  source: ChangeSource;
  occurredAt: Date;
}

async function channelId(tx: Executor, slug: string | null): Promise<number | null> {
  if (!slug) return null;
  const [row] = await tx.select({ id: channels.id }).from(channels).where(eq(channels.slug, slug));
  if (!row) throw new InvalidMoveError(`Canal desconocido: ${slug}`);
  return row.id;
}

/** Estado actual con la fila bloqueada, para que dos cambios no partan del mismo estado. */
async function lockStatus(tx: Executor, vacancyId: number): Promise<VacancyStatus | null> {
  const [row] = await tx
    .select({ status: vacancies.status })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId))
    .for("update");
  return row?.status ?? null;
}

/** Agrega el cambio al historial y fija el estado de la vacante. */
async function apply(tx: Executor, vacancyId: number, from: VacancyStatus, change: Change) {
  await tx.insert(vacancyStatusChanges).values({
    vacancyId,
    fromStatus: from,
    toStatus: change.to,
    discardReason: change.discardReason,
    note: change.note,
    channelId: await channelId(tx, change.channel),
    source: change.source,
    occurredAt: change.occurredAt,
  });
  await tx
    .update(vacancies)
    .set({ status: change.to, discardReason: change.discardReason })
    .where(eq(vacancies.id, vacancyId));
}

/**
 * Movimiento de la app (envío del correo, respuesta en Gmail): solo si hace avanzar el proceso.
 * Corre en la transacción de quien registra el hecho.
 */
export async function advanceVacancy(
  tx: Executor,
  vacancyId: number,
  to: VacancyStatus,
  at: { channel: string | null; occurredAt: Date },
): Promise<void> {
  const current = await lockStatus(tx, vacancyId);
  if (current === null || !advancesAutomatically(current, to)) return;
  await apply(tx, vacancyId, current, {
    to,
    discardReason: null,
    note: null,
    source: "auto",
    ...at,
  });
}

type ChangeRow = Omit<StatusChange, "id" | "occurredAt" | "createdAt"> & {
  id: number;
  occurredAt: Date;
  createdAt: Date;
};

function toChange(row: ChangeRow): StatusChange {
  return {
    ...row,
    id: formatId(row.id),
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

async function read(tx: Executor, vacancyId: number): Promise<VacancyProcess | null> {
  const [vacancy] = await tx
    .select({ status: vacancies.status, discardReason: vacancies.discardReason })
    .from(vacancies)
    .where(eq(vacancies.id, vacancyId));
  if (!vacancy) return null;
  const history = await tx
    .select({
      id: vacancyStatusChanges.id,
      from: vacancyStatusChanges.fromStatus,
      to: vacancyStatusChanges.toStatus,
      discardReason: vacancyStatusChanges.discardReason,
      note: vacancyStatusChanges.note,
      channel: channels.slug,
      source: vacancyStatusChanges.source,
      occurredAt: vacancyStatusChanges.occurredAt,
      createdAt: vacancyStatusChanges.createdAt,
    })
    .from(vacancyStatusChanges)
    .leftJoin(channels, eq(channels.id, vacancyStatusChanges.channelId))
    .where(eq(vacancyStatusChanges.vacancyId, vacancyId))
    .orderBy(desc(vacancyStatusChanges.occurredAt), desc(vacancyStatusChanges.id));
  return {
    vacancyId: formatId(vacancyId),
    ...vacancy,
    history: history.map(toChange),
    contacts: await listVacancyContacts(tx, vacancyId),
  };
}

export function createProcessRepository(db: Executor) {
  return {
    /** Estado, historial (más reciente primero) y contactos; `null` si la vacante no existe. */
    async get(vacancyId: string): Promise<VacancyProcess | null> {
      const id = parseId(vacancyId);
      return id === null ? null : read(db, id);
    },

    /** Movimiento manual (#80); `null` si la vacante no existe. */
    async move(vacancyId: string, input: MoveStatusRequest): Promise<VacancyProcess | null> {
      const id = parseId(vacancyId);
      if (id === null) return null;
      return db.transaction(async (tx) => {
        const current = await lockStatus(tx, id);
        if (current === null) return null;
        const error = moveError(current, input);
        if (error) throw new InvalidMoveError(error);
        await apply(tx, id, current, {
          to: input.to,
          discardReason: input.discardReason ?? null,
          note: input.note ?? null,
          channel: input.channel ?? null,
          source: "manual",
          occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        });
        return read(tx, id);
      });
    },
  };
}

export type ProcessRepository = ReturnType<typeof createProcessRepository>;
