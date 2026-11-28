import type { ApplicationContact, Contact, ContactInput } from "@apply/shared";
import { and, asc, eq } from "drizzle-orm";
import { companies, contacts, vacancies, vacancyContacts } from "#db";
import type { Db, Executor } from "../db.ts";
import { formatId, parseId } from "../ids.ts";

const contactColumns = {
  id: contacts.id,
  name: contacts.name,
  title: contacts.title,
  email: contacts.email,
  phone: contacts.phone,
  profileUrl: contacts.profileUrl,
  notes: contacts.notes,
  company: companies.name,
  createdAt: contacts.createdAt,
};

type ContactRow = Omit<Contact, "id" | "createdAt"> & { id: number; createdAt: Date };

function toContact(row: ContactRow): Contact {
  return { ...row, id: formatId(row.id), createdAt: row.createdAt.toISOString() };
}

/** Campos que escribe el usuario; un opcional ausente queda en `null` (editar reemplaza todo). */
function fields(input: ContactInput) {
  return {
    name: input.name,
    title: input.title ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    profileUrl: input.profileUrl ?? null,
    notes: input.notes ?? null,
  };
}

/** Contactos vinculados a la vacante (#80), en el orden en que se agregaron. */
export async function listVacancyContacts(
  tx: Executor,
  vacancyId: number,
): Promise<ApplicationContact[]> {
  const rows = await tx
    .select({ ...contactColumns, isProcessStart: vacancyContacts.isProcessStart })
    .from(vacancyContacts)
    .innerJoin(contacts, eq(contacts.id, vacancyContacts.contactId))
    .leftJoin(companies, eq(companies.id, contacts.companyId))
    .where(eq(vacancyContacts.vacancyId, vacancyId))
    .orderBy(asc(vacancyContacts.createdAt), asc(contacts.id));
  return rows.map(({ isProcessStart, ...row }) => ({ ...toContact(row), isProcessStart }));
}

/** `true` si el contacto está vinculado a la vacante. */
export async function isLinked(
  tx: Executor,
  vacancyId: number,
  contactId: number,
): Promise<boolean> {
  const [row] = await tx
    .select({ contactId: vacancyContacts.contactId })
    .from(vacancyContacts)
    .where(and(eq(vacancyContacts.vacancyId, vacancyId), eq(vacancyContacts.contactId, contactId)));
  return row !== undefined;
}

async function findVacancyContact(
  tx: Executor,
  vacancyId: number,
  contactId: number,
): Promise<ApplicationContact | null> {
  const linked = await listVacancyContacts(tx, vacancyId);
  return linked.find((c) => c.id === formatId(contactId)) ?? null;
}

/** Solo un contacto inicia el proceso (C8): marcar uno desmarca los demás de la vacante. */
async function setProcessStart(
  tx: Executor,
  vacancyId: number,
  contactId: number,
  isProcessStart: boolean,
): Promise<void> {
  if (isProcessStart) {
    await tx
      .update(vacancyContacts)
      .set({ isProcessStart: false })
      .where(eq(vacancyContacts.vacancyId, vacancyId));
  }
  await tx
    .update(vacancyContacts)
    .set({ isProcessStart })
    .where(and(eq(vacancyContacts.vacancyId, vacancyId), eq(vacancyContacts.contactId, contactId)));
}

export function createContactsRepository(db: Db) {
  return {
    /**
     * Crea el contacto con la empresa de la vacante y lo vincula a ella.
     * `null` si la vacante no existe.
     */
    async addToVacancy(
      vacancyId: string,
      input: ContactInput & { isProcessStart?: boolean },
    ): Promise<ApplicationContact | null> {
      const vid = parseId(vacancyId);
      if (vid === null) return null;
      return db.transaction(async (tx) => {
        const [vacancy] = await tx
          .select({ companyId: vacancies.companyId })
          .from(vacancies)
          .where(eq(vacancies.id, vid));
        if (!vacancy) return null;

        const [created] = await tx
          .insert(contacts)
          .values({ ...fields(input), companyId: vacancy.companyId })
          .returning({ id: contacts.id });
        if (!created) throw new Error("No se pudo guardar el contacto");
        await tx.insert(vacancyContacts).values({ vacancyId: vid, contactId: created.id });
        if (input.isProcessStart) await setProcessStart(tx, vid, created.id, true);
        return findVacancyContact(tx, vid, created.id);
      });
    },

    /** Reemplaza los datos del contacto; `null` si no existe. */
    async update(id: string, input: ContactInput): Promise<Contact | null> {
      const cid = parseId(id);
      if (cid === null) return null;
      const [updated] = await db
        .update(contacts)
        .set(fields(input))
        .where(eq(contacts.id, cid))
        .returning({ id: contacts.id });
      if (!updated) return null;
      const [row] = await db
        .select(contactColumns)
        .from(contacts)
        .leftJoin(companies, eq(companies.id, contacts.companyId))
        .where(eq(contacts.id, cid));
      return row ? toContact(row) : null;
    },

    /** Marca o desmarca el inicio de proceso (REQ-005); `null` si el contacto no está vinculado. */
    async markProcessStart(
      vacancyId: string,
      contactId: string,
      isProcessStart: boolean,
    ): Promise<ApplicationContact | null> {
      const vid = parseId(vacancyId);
      const cid = parseId(contactId);
      if (vid === null || cid === null) return null;
      return db.transaction(async (tx) => {
        if (!(await isLinked(tx, vid, cid))) return null;
        await setProcessStart(tx, vid, cid, isProcessStart);
        return findVacancyContact(tx, vid, cid);
      });
    },
  };
}

export type ContactsRepository = ReturnType<typeof createContactsRepository>;
