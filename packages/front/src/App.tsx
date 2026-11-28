import { BarChart3, Briefcase, FileText, Mail, Send, UserRound } from "lucide-react";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApplicationsPage } from "@/features/applications/applications-page";
import { CvsPage } from "@/features/cvs/cvs-page";
import { GmailPage } from "@/features/gmail/gmail-page";
import { MetricsPage } from "@/features/metrics/metrics-page";
import { ProfilePage } from "@/features/profile/profile-page";
import { VacanciesPage } from "@/features/vacancies/vacancies-page";

type Tab = "profile" | "vacancies" | "cvs" | "applications" | "metrics" | "gmail";

export default function App() {
  const [tab, setTab] = useState<Tab>("vacancies");
  const [openCvId, setOpenCvId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3">
            <h1 className="font-semibold tracking-tight">Apply</h1>
            <TabsList className="min-w-0 max-w-full justify-start overflow-x-auto">
              <TabsTrigger value="profile">
                <UserRound /> Mi perfil
              </TabsTrigger>
              <TabsTrigger value="vacancies">
                <Briefcase /> Vacantes
              </TabsTrigger>
              <TabsTrigger value="cvs">
                <FileText /> CVs
              </TabsTrigger>
              <TabsTrigger value="applications">
                <Send /> Postulaciones
              </TabsTrigger>
              <TabsTrigger value="metrics">
                <BarChart3 /> Métricas
              </TabsTrigger>
              <TabsTrigger value="gmail">
                <Mail /> Gmail
              </TabsTrigger>
            </TabsList>
            <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
              Todo se guarda en local en <code>./data</code>
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] p-4">
          <TabsContent value="profile">
            <ProfilePage />
          </TabsContent>
          <TabsContent value="vacancies" keepMounted>
            <VacanciesPage
              onCvCreated={(cv) => {
                setOpenCvId(cv.id);
                setTab("cvs");
              }}
            />
          </TabsContent>
          <TabsContent value="cvs">
            <CvsPage initialId={openCvId} />
          </TabsContent>
          <TabsContent value="applications">
            <ApplicationsPage />
          </TabsContent>
          <TabsContent value="metrics">
            <MetricsPage />
          </TabsContent>
          <TabsContent value="gmail">
            <GmailPage />
          </TabsContent>
        </main>
      </Tabs>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
