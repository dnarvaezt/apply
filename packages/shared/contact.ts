/** Canal de contacto (`email`, `linkedin`, `ats`, ...); uno nuevo es una fila de `channels`. */
export interface Channel {
  slug: string;
  name: string;
}

/** Datos que el usuario escribe de un contacto; `""` o `null` dejan el campo vacío. */
export interface ContactInput {
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  /** URL del perfil (LinkedIn u otro). */
  profileUrl?: string | null;
  notes?: string | null;
}

export interface Contact {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  profileUrl: string | null;
  notes: string | null;
  /** Empresa de la vacante de la postulación donde se registró. */
  company: string | null;
  createdAt: string;
}

/** Contacto vinculado a una postulación; `isProcessStart` marca quien inició el proceso (C8). */
export interface ApplicationContact extends Contact {
  isProcessStart: boolean;
}

export interface NewApplicationContactRequest extends ContactInput {
  isProcessStart?: boolean;
}
