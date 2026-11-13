import { listAnswers } from "@/lib/answers/bank";
import { saveAnswerAction, deleteAnswerAction, setTailorPerJobAction } from "./actions";

// Answer library: the user saves answers to custom application questions once; the
// autofill reuses them on future forms with NO AI call. Per-user scoped.
export async function AnswerBank({
  userId,
  tailorPerJob,
  subscribed,
}: {
  userId: string;
  tailorPerJob: boolean;
  subscribed: boolean;
}) {
  const answers = await listAnswers(userId);
  return (
    <section className="card mt-6 p-5" aria-label="Application answers">
      <h2 className="section-label">Application answers</h2>
      <p className="text-sm text-ink-muted">
        Save answers to custom application questions once — autofill reuses them on future forms with no AI
        call. Sensitive questions still pause for you unless you save an answer here yourself.
      </p>

      <form action={saveAnswerAction} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input name="question" placeholder="Question, e.g. Why do you want to work here?" className="input" maxLength={500} required />
        <input name="answer" placeholder="Your answer" className="input" maxLength={2000} required />
        <button type="submit" className="btn-primary">Save</button>
      </form>

      <ul className="mt-4 divide-y divide-stone-200">
        {answers.length === 0 && <li className="py-2 text-sm text-ink-faint">No saved answers yet.</li>}
        {answers.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{a.questionLabel}</p>
              <p className="truncate text-xs text-ink-muted">{a.answer}</p>
            </div>
            <form action={deleteAnswerAction.bind(null, a.id)}>
              <button type="submit" className="btn-ghost btn-sm text-danger">Delete</button>
            </form>
          </li>
        ))}
      </ul>

      {subscribed && (
        <form action={setTailorPerJobAction} className="mt-5 border-t border-stone-200 pt-4">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="tailorPerJob" defaultChecked={tailorPerJob} className="mt-0.5 h-4 w-4 accent-brick" />
            <span>
              <strong>Tailor my résumé per job with AI</strong> (Pro). When off, auto-apply uploads your standard
              résumé with no AI cost.
            </span>
          </label>
          <button type="submit" className="btn-secondary btn-sm mt-3">Save preference</button>
        </form>
      )}
    </section>
  );
}
