"use client";

import { notFound } from "next/navigation";
import { isGmailEnabled } from "@/features/gmail/gmail-enabled";
import { GmailPage } from "@/features/gmail/gmail-page";

export default function Page() {
  if (!isGmailEnabled()) notFound();
  return <GmailPage />;
}
