import AIDiagnosis from "./AIDiagnosis";
import AITechnicianRecommendation from "./AITechnicianRecommendation";
import AIServiceSummary from "./AIServiceSummary";
import type { Role } from "@/types";

/**
 * ✦ AI tab for the request detail view. Sections are gated by the existing
 * role system; everything inside is read-only advisory content.
 */
export default function AITab({ requestId, role }: { requestId: string; role: Role }) {
  const customer = role === "CUSTOMER";
  const tech = role === "TECHNICIAN";
  const ops = role === "OPS_MANAGER" || role === "ADMIN";
  return (
    <div style={{ marginTop: 12 }}>
      <AIDiagnosis requestId={requestId} basic={customer} />
      {ops && <AITechnicianRecommendation requestId={requestId} />}
      {!customer && <AIServiceSummary requestId={requestId} />}
      {customer && (
        <div className="so-req-sub" style={{ marginTop: 10 }}>
          Customer view shows the core diagnosis. Technician and operations workspaces unlock recommendations and summaries.
        </div>
      )}
      {tech && (
        <div className="so-req-sub" style={{ marginTop: 10 }}>
          Technician view: diagnosis, checks and summary. Staffing recommendations live in the operations workspace.
        </div>
      )}
    </div>
  );
}
