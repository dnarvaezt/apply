import { Briefcase, FileText, UserRound } from "lucide-react";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CvsPage } from "@/features/cvs/cvs-page";
import { ProfilePage } from "@/features/profile/profile-page";
import { VacanciesPage } from "@/features/vacancies/vacancies-page";

type Tab = "profile" | "vacancies" | "cvs";

export default function App() {
  const [tab, setTab] = useState<Tab>("vacancies");
  const [openCvId, setOpenCvId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3">
            <h1 className="font-semibold tracking-tight">CV Tailor</h1>
            <TabsList>
              <TabsTrigger value="profile">
                <UserRound /> Mi perfil
              </TabsTrigger>
              <TabsTrigger value="vacancies">
                <Briefcase /> Vacantes
              </TabsTrigger>
              <TabsTrigger value="cvs">
                <FileText /> CVs
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
        </main>
      </Tabs>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
