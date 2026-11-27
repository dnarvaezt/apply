import { applicationContacts, applications, companies, contacts, vacancies } from "@apply/db";
import type { ApplicationContact, Contact, ContactInput } from "@apply/shared";
import { and, asc, eq } from "drizzle-orm";
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

/** Contactos vinculados a la postulación, en el orden en que se agregaron. */
export async function listApplicationContacts(
  tx: Executor,
  applicationId: number,
): Promise<ApplicationContact[]> {
  const rows = await tx
    .select({ ...contactColumns, isProcessStart: applicationContacts.isProcessStart })
    .from(applicationContacts)
    .innerJoin(contacts, eq(contacts.id, applicationContacts.contactId))
    .leftJoin(companies, eq(companies.id, contacts.companyId))
    .where(eq(applicationContacts.applicationId, applicationId))
    .orderBy(asc(applicationContacts.createdAt), asc(contacts.id));
  return rows.map(({ isProcessStart, ...row }) => ({ ...toContact(row), isProcessStart }));
}

/** `true` si el contacto está vinculado a la postulación. */
export async function isLinked(
  tx: Executor,
  applicationId: number,
  contactId: number,
): Promise<boolean> {
  const [row] = await tx
    .select({ contactId: applicationContacts.contactId })
    .from(applicationContacts)
    .where(
      and(
        eq(applicationContacts.applicationId, applicationId),
        eq(applicationContacts.contactId, contactId),
      ),
    );
  return row !== undefined;
}

async function findApplicationContact(
  tx: Executor,
  applicationId: number,
  contactId: number,
): Promise<ApplicationContact | null> {
  const linked = await listApplicationContacts(tx, applicationId);
  return linked.find((c) => c.id === formatId(contactId)) ?? null;
}

/** Solo un contacto inicia el proceso (C8): marcar uno desmarca los demás de la postulación. */
async function setProcessStart(
  tx: Executor,
  applicationId: number,
  contactId: number,
  isProcessStart: boolean,
): Promise<void> {
  if (isProcessStart) {
    await tx
      .update(applicationContacts)
      .set({ isProcessStart: false })
      .where(eq(applicationContacts.applicationId, applicationId));
  }
  await tx
    .update(applicationContacts)
    .set({ isProcessStart })
    .where(
      and(
        eq(applicationContacts.applicationId, applicationId),
        eq(applicationContacts.contactId, contactId),
      ),
    );
}

export function createContactsRepository(db: Db) {
  return {
    /**
     * Crea el contacto con la empresa de la vacante de la postulación y lo vincula a ella.
     * `null` si la postulación no existe.
     */
    async addToApplication(
      applicationId: string,
      input: ContactInput & { isProcessStart?: boolean },
    ): Promise<ApplicationContact | null> {
      const aid = parseId(applicationId);
      if (aid === null) return null;
      return db.transaction(async (tx) => {
        const [application] = await tx
          .select({ companyId: vacancies.companyId })
          .from(applications)
          .innerJoin(vacancies, eq(vacancies.id, applications.vacancyId))
          .where(eq(applications.id, aid));
        if (!application) return null;

        const [created] = await tx
          .insert(contacts)
          .values({ ...fields(input), companyId: application.companyId })
          .returning({ id: contacts.id });
        if (!created) throw new Error("No se pudo guardar el contacto");
        await tx.insert(applicationContacts).values({ applicationId: aid, contactId: created.id });
        if (input.isProcessStart) await setProcessStart(tx, aid, created.id, true);
        return findApplicationContact(tx, aid, created.id);
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
      applicationId: string,
      contactId: string,
      isProcessStart: boolean,
    ): Promise<ApplicationContact | null> {
      const aid = parseId(applicationId);
      const cid = parseId(contactId);
      if (aid === null || cid === null) return null;
      return db.transaction(async (tx) => {
        if (!(await isLinked(tx, aid, cid))) return null;
        await setProcessStart(tx, aid, cid, isProcessStart);
        return findApplicationContact(tx, aid, cid);
      });
    },
  };
}

export type ContactsRepository = ReturnType<typeof createContactsRepository>;
