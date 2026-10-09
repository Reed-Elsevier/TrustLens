import type { Metadata } from "next";
import Link from "next/link";
import { STORE_CONFIG } from "@/lib/analyze/config";
import { BUCKET_LIMITS } from "@/lib/analyze/bucketlist";
import { BUTTON_SECONDARY, EYEBROW } from "@/components/analyzer/ui";

export const metadata: Metadata = { title: "Data privacy and usage policy | TrustLens" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-ink sm:px-6">
      <Link href="/" className={BUTTON_SECONDARY}>Back to TrustLens</Link>
      <p className={`mt-8 ${EYEBROW}`}>Last updated: 9 October 2026</p>
      <h1 className="mt-3 text-3xl font-semibold text-bright">Data privacy and usage policy</h1>
      <p className="mt-4">This policy describes the current TrustLens research-screening demo. It is a technical description, not a claim of GDPR, HIPAA, or other regulatory compliance. A production deployment needs an identified operator, appropriate contracts, access controls and a legally reviewed policy.</p>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-bright">1. What is processed and why</h2>
        <p>When you upload a PDF, its bytes, file name and extracted text are sent to the app server to compute structure, integrity, legal-citation and potential-plagiarism checks. The app parses PDFs in memory and does not write uploaded PDFs or their extracted text to its SQLite database or filesystem.</p>
        <p>The server keeps extracted text, passages, analysis results and any cached AI review in a bounded, in-memory cache so follow-up review and chat can use the same evidence. Chat history is held in the page and sent with chat requests; the app does not separately persist conversations.</p>
        <p>The published abstracts and legal records already in the demo database are a limited comparison corpus, separate from your uploaded paper. Text-overlap screening does not search the internet or prove plagiarism.</p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-bright">2. AI processing is optional</h2>
        <p>AI processing is off by default. Server-side screening, rule-based review, rule-based chat and bucket-list tasks remain usable without sending content to the model. Merely opening this page or uploading a PDF does not opt you in.</p>
        <p>If you check the AI consent box, review and chat requests can send computed findings, source and manuscript excerpts, retrieved passages, your question and limited chat history to Claude through AWS Bedrock. The complete PDF is not sent to the model by this app, but extracts may still contain personal or confidential information.</p>
        <p>Consent lasts only for the current page session; it is not saved as a cookie or browser preference. Uncheck the box or reload to stop future AI processing. Switching modes clears the current chat. Requests already sent cannot be recalled, and cached AI replies do not bypass the server-side opt-in requirement.</p>
        <p>The app cannot guarantee the external provider&apos;s retention, processing location or contractual terms. Those depend on the deployment operator&apos;s AWS account, region and agreements. Review the applicable provider terms and <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html" target="_blank" rel="noreferrer" className="text-accent underline">AWS Bedrock data-protection documentation</a> before consenting.</p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-bright">3. Browser storage and retention</h2>
        <p>Task titles, actions, priorities, completion state, file names, analysis identifiers and compact latest/previous check summaries are stored in this browser&apos;s localStorage. This metadata can itself be sensitive. PDFs, full extracted manuscript text and matched passage excerpts are not saved in localStorage.</p>
        <p>Saved lists are scoped to this browser and site origin, not a user account. Anyone using the same browser profile may see them. They remain until you delete a saved list or clear site storage. The app allows up to {BUCKET_LIMITS.documents} saved papers and {BUCKET_LIMITS.tasks} tasks per paper and does not silently evict lists when a limit is reached.</p>
        <p>The server cache holds at most {STORE_CONFIG.maxEntries} analyses. An analysis expires after {STORE_CONFIG.ttlMs / 60_000} minutes without access; expired entries are removed when the cache is next accessed. Earlier removal can occur through cache eviction, a pipeline update, deletion or server restart. This is not a promise of physical erasure at the exact expiry instant.</p>
        <p>This feature does not add advertising, analytics or tracking cookies. The hosting environment, reverse proxy and AWS may keep their own operational logs under the operator&apos;s policies. The app logs API status/timing and sanitized AI failures; uploaded document content is not intentionally logged.</p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-bright">4. Deleting your data</h2>
        <p>Choose <strong>Delete saved list</strong> in a paper&apos;s bucket list and confirm to remove its browser metadata and request deletion of its known cached server analyses. Identical PDF uploads share an analysis identifier, so deleting that cached report can also expire chat for another list using the same file.</p>
        <p>New lists retain revision identifiers for deletion. For lists saved by an older version, only identifiers still reachable from the latest/previous summaries or tasks can be deleted this way; any older unreachable cache entries expire normally. Deletion covers the current server process, not independent replicas, infrastructure logs, backups or already-sent provider requests.</p>
        <p>If browser data is malformed, the app offers a confirmed browser-only clear. Clearing browser site storage alone does not delete server cache entries; they remain subject to the cache expiry and eviction rules. Storage and deletion failures are displayed rather than reported as successful.</p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-bright">5. Safe use and limitations</h2>
        <p>This demo has no account authentication or account-level document isolation. Treat analysis identifiers as sensitive. Do not upload confidential manuscripts, privileged legal material, personal data, secrets or documents you lack permission to process. For private production use, the deployment operator must supply authentication, authorization, transport security, appropriate retention controls and provider agreements.</p>
        <p>Results are screening indicators, not proof of misconduct, legal advice or an acceptance decision. A detected heading does not establish content quality. Human review is required for attribution, citations, legal judgments, incomplete text and subjective revision tasks.</p>
        <p>Contact the operator of your deployment for privacy questions, applicable rights and provider-processing details. Do not attach confidential documents to repository issues or other public support channels.</p>
      </section>
    </main>
  );
}
