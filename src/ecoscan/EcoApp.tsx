import { useState } from "react";
import { Layout, type EcoPage } from "@/ecoscan/components/Layout";
import Dashboard from "@/ecoscan/pages/Dashboard";
import Scanner from "@/ecoscan/pages/Scanner";
import ScanDetail from "@/ecoscan/pages/ScanDetail";
import History from "@/ecoscan/pages/History";
import Materials from "@/ecoscan/pages/Materials";
import Sorting from "@/ecoscan/pages/Sorting";
import Hardware from "@/ecoscan/pages/Hardware";
import Collections from "@/ecoscan/pages/Collections";
import Sustainability from "@/ecoscan/pages/Sustainability";
import Knowledge from "@/ecoscan/pages/Knowledge";
import Alerts from "@/ecoscan/pages/Alerts";
import Settings from "@/ecoscan/pages/Settings";

export default function EcoApp() {
  const [page, setPage] = useState<EcoPage>("overview");
  const [detail, setDetail] = useState<string | null>(null);
  const openScan = (id: string) => setDetail(id);
  const go = (p: EcoPage) => { setDetail(null); setPage(p); };

  return (
    <Layout page={page} setPage={go} scanDetail={detail}>
      {detail ? <ScanDetail id={detail} back={() => setDetail(null)} /> : (
        <>
          {page === "overview" && <Dashboard go={go} openScan={openScan} />}
          {page === "scanner" && <Scanner openScan={openScan} />}
          {page === "history" && <History openScan={openScan} go={go} />}
          {page === "materials" && <Materials />}
          {page === "sorting" && <Sorting openScan={openScan} />}
          {page === "hardware" && <Hardware />}
          {page === "collections" && <Collections />}
          {page === "sustainability" && <Sustainability />}
          {page === "knowledge" && <Knowledge />}
          {page === "alerts" && <Alerts openScan={openScan} />}
          {page === "settings" && <Settings />}
        </>
      )}
    </Layout>
  );
}
