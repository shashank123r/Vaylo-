import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { listResumes, ACCEPT_ATTR } from "@/lib/resume/service";
import { getProfileStatus } from "@/lib/profile/data";
import { SECTIONS, isSectionId, sectionDef } from "@/lib/profile/sections";
import type { SectionId } from "@/lib/profile/completion";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui";
import { AnswerBank } from "./AnswerBank";
import { isSubscribed } from "@/lib/billing/entitlement";
import {
  saveSection,
  addEducation,
  deleteEducation,
  addExperience,
  deleteExperience,
  addSkill,
  deleteSkill,
  addProject,
  deleteProject,
  addCertification,
  deleteCertification,
  deleteResumeAction,
  autofillFromResumeAction,
} from "./actions";

function Input({ name, label, value, type = "text", placeholder = "", hint, required = false }: { name: string; label: string; value?: string | null; type?: string; placeholder?: string; hint?: string; required?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}{required && <span className="text-brick" aria-hidden="true"> *</span>}
      </label>
      <input id={name} name={name} type={type} defaultValue={value ?? ""} placeholder={placeholder} required={required} aria-required={required} className="input" />
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
function Select({ name, label, value, options }: { name: string; label: string; value?: string | null; options: [string, string][] }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={value ?? ""} className="input">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
const triVal = (b: boolean | null | undefined) => (b === true ? "yes" : b === false ? "no" : "");

export default async function ProfileWizard({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; saved?: string; error?: string; uploaded?: string; autofilled?: string }>;
}) {
  const user = (await getCurrentUser())!;
  const sp = await searchParams;
  const active: SectionId = isSectionId(sp.s) ? sp.s : "personal";

  const [profile, resumes, status] = await Promise.all([
    db.profile.findUnique({
      where: { userId: user.id },
      include: {
        education: { orderBy: { order: "asc" } },
        experience: { orderBy: { order: "asc" } },
        skills: { orderBy: { name: "asc" } },
        projects: { orderBy: { order: "asc" } },
        certifications: { orderBy: { order: "asc" } },
      },
    }),
    listResumes(user.id),
    getProfileStatus(user.id),
  ]);
  const subscribed = await isSubscribed(user.id);
  const { completion, readiness } = status;

  const def = sectionDef(active);
  const secPct = (id: SectionId) => completion.sections.find((s) => s.section === id)?.percent;
  const wac = (profile?.workAuthByCountry ?? null) as Record<string, string> | null;
  const firstAuth = wac ? Object.entries(wac)[0] : undefined;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Profile"
        subtitle="Fill it in section by section — we save as you go, extract what we can from your resume, and never invent facts. Sensitive declarations are optional and never affect your score."
      />

      {/* Progress */}
      <div className="card p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm font-medium">Profile {completion.percent}% complete</p>
            <p className="text-xs text-ink-muted">
              {completion.countedComplete} of {completion.countedTotal} key fields · sensitive & optional fields excluded
            </p>
          </div>
          <span className="text-2xl font-semibold tabular-nums">{completion.percent}%</span>
        </div>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={completion.percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-brick transition-all" style={{ width: `${completion.percent}%` }} />
        </div>
        {(completion.missingEssential.length > 0 || completion.missingHelpful.length > 0) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {completion.missingEssential.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brick">Needed next</p>
                <ul className="mt-1 space-y-0.5 text-sm text-ink-muted">
                  {completion.missingEssential.map((m) => (
                    <li key={m.key}>
                      <Link href={`/app/profile?s=${m.section}`} className="underline">{m.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {completion.missingHelpful.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Helps matching</p>
                <ul className="mt-1 space-y-0.5 text-sm text-ink-muted">
                  {completion.missingHelpful.slice(0, 8).map((m) => (
                    <li key={m.key}><Link href={`/app/profile?s=${m.section}`} className="underline">{m.label}</Link></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Readiness */}
      <div className="card mt-4 p-5">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${readiness.ready ? "bg-success" : "bg-warning"}`} aria-hidden="true" />
          <h2 className="font-semibold">
            {readiness.ready ? "Ready to apply to supported roles" : "Not application-ready yet"}
          </h2>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {readiness.ready
            ? "Your essentials are in place. Completion isn’t a guarantee of eligibility or ATS compatibility — some forms ask extra questions."
            : "Fill the essential items below so applications can be prepared from verified facts."}
        </p>
        {readiness.blockers.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {readiness.blockers.map((b) => (
              <li key={b.key}>
                <Link href={`/app/profile?s=${b.section}`} className="badge text-brick no-underline">{b.label}</Link>
              </li>
            ))}
          </ul>
        )}
        {readiness.mayPause.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">May pause specific applications</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-muted">
              {readiness.mayPause.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
            <p className="mt-1 text-xs text-ink-muted">When an application needs one of these, we pause and ask you instead of guessing.</p>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr]">
        {/* Section nav */}
        <nav aria-label="Profile sections" className="flex flex-col gap-1">
          {SECTIONS.map((sec) => {
            const pct = secPct(sec.id);
            const isActive = sec.id === active;
            return (
              <Link
                key={sec.id}
                href={`/app/profile?s=${sec.id}`}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-sm no-underline transition-colors ${isActive ? "bg-surface font-medium text-ink shadow-card" : "text-ink-muted hover:bg-stone-200/60 hover:text-ink"}`}
                aria-current={isActive ? "page" : undefined}
              >
                <span>{sec.label}</span>
                {pct !== undefined && <span className="text-xs tabular-nums">{pct}%</span>}
              </Link>
            );
          })}
        </nav>

        {/* Active section */}
        <section className="min-w-0">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">{def.label}</h2>
            <p className="text-sm text-ink-muted">{def.blurb}</p>
          </div>

          {sp.saved && <div className="mb-4 rounded-md border border-success/30 bg-surface-2 px-3 py-2 text-sm text-success">Saved.</div>}
          {sp.uploaded && (
            <div className="mb-4 rounded-md border border-success/30 bg-surface-2 px-3 py-2 text-sm text-success">
              Resume uploaded.{" "}
              {sp.autofilled
                ? `We filled ${sp.autofilled} empty field(s) from it — review the “from resume” items and confirm or edit them.`
                : "No new fields were auto-filled (nothing new to add, or text could not be read)."}
            </div>
          )}
          {sp.error && <div className="mb-4 rounded-md border border-danger/30 bg-brick-soft px-3 py-2 text-sm">{sp.error}</div>}
          {sp.autofilled && !sp.uploaded && (
            <div className="mb-4 rounded-md border border-success/30 bg-surface-2 px-3 py-2 text-sm text-success">
              {Number(sp.autofilled) > 0
                ? `Filled ${sp.autofilled} empty field(s) from your resume — review the “from resume” items and confirm or edit them.`
                : "Nothing new to fill from your resume (fields are already set, or the text could not be read)."}
            </div>
          )}

          {/* Auto-fill from résumé. Always shown so the feature is discoverable:
              when a résumé exists it re-runs extraction; otherwise it points to
              upload. (Uploading also auto-fills — see /api/resumes.) */}
          {resumes.length > 0 ? (
            <form action={autofillFromResumeAction} className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-brick/30 bg-brick-soft px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Auto-fill from your résumé</p>
                <p className="text-xs text-ink-muted">
                  Reads your uploaded résumé and fills empty fields — name, phone, location, education,
                  experience, skills, LinkedIn, GitHub. Never overwrites confirmed values or invents facts;
                  your account email stays as-is.
                </p>
              </div>
              <SubmitButton pendingText="Reading résumé…">Auto-fill from résumé</SubmitButton>
            </form>
          ) : (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-stone-200 bg-surface px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Auto-fill from your résumé</p>
                <p className="text-xs text-ink-muted">
                  Upload your résumé and Vaylo fills your name, phone, location, education, experience and
                  skills automatically — review and confirm each one.
                </p>
              </div>
              <Link href="/app/profile?s=documents" className="btn-secondary no-underline">Upload résumé</Link>
            </div>
          )}

          {/* ---------- PERSONAL ---------- */}
          {active === "personal" && (
            <form action={saveSection.bind(null, "personal")} className="card space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input name="legalName" label="Legal name" value={profile?.legalName} placeholder="As on official documents" required />
                <Input name="preferredName" label="Preferred name" value={profile?.preferredName} />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input bg-surface-2" value={user.email} readOnly aria-readonly />
                <p className="mt-1 text-xs text-ink-muted">From your account.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input name="phone" label="Phone" value={profile?.phone} required />
                <Input name="city" label="City" value={profile?.city} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input name="country" label="Country" value={profile?.country} />
                <Input name="address" label="Address (only if needed)" value={profile?.address} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input name="linkedin" label="LinkedIn" value={profile?.linkedin} />
                <Input name="github" label="GitHub" value={profile?.github} />
              </div>
              <Input name="portfolio" label="Portfolio / website" value={profile?.portfolio ?? profile?.website} />
              <SubmitButton pendingText="Saving…">Save &amp; continue</SubmitButton>
            </form>
          )}

          {/* ---------- PREFERENCES ---------- */}
          {active === "preferences" && (
            <form action={saveSection.bind(null, "preferences")} className="card space-y-4 p-5">
              <Input name="targetTitles" label="Target roles (comma-separated)" value={profile?.targetTitles.join(", ")} placeholder="ML Engineer, GenAI Engineer" required />
              <Input name="targetLocations" label="Preferred locations (comma-separated)" value={profile?.targetLocations.join(", ")} placeholder="Berlin, Remote EU" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select name="workplaceType" label="Workplace" value={profile?.workplaceType} options={[["", "—"], ["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"], ["flexible", "Flexible"]]} />
                <Select name="employmentType" label="Employment type" value={profile?.employmentType} options={[["", "—"], ["full_time", "Full-time"], ["part_time", "Part-time"], ["contract", "Contract"], ["internship", "Internship"], ["temporary", "Temporary"]]} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input name="minSalary" label="Salary expectation (optional)" value={profile?.minSalary != null ? String(profile.minSalary) : ""} type="number" />
                <Input name="salaryCurrency" label="Currency" value={profile?.salaryCurrency} placeholder="USD" />
                <Select name="salaryPeriod" label="Per" value={profile?.salaryPeriod} options={[["", "—"], ["year", "Year"], ["month", "Month"], ["hour", "Hour"]]} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input name="noticePeriod" label="Notice period" value={profile?.noticePeriod} placeholder="e.g. 30 days" />
                <Select name="openToRelocation" label="Open to relocation" value={triVal(profile?.openToRelocation)} options={[["", "Prefer not to say"], ["yes", "Yes"], ["no", "No"]]} />
              </div>
              <SubmitButton pendingText="Saving…">Save &amp; continue</SubmitButton>
            </form>
          )}

          {/* ---------- EDUCATION ---------- */}
          {active === "education" && (
            <div className="space-y-4">
              {profile?.education.map((e) => (
                <div key={e.id} className="card flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-ink">{e.school}{e.degree ? ` · ${e.degree}` : ""}</p>
                    <p className="text-ink-muted">{[e.field, [e.startDate, e.endDate].filter(Boolean).join(" – "), e.graduationStatus].filter(Boolean).join(" · ")}</p>
                    {e.grade && <p className="text-ink-muted">Grade: {e.grade}{e.gradeScale ? ` (${e.gradeScale})` : ""}</p>}
                    {e.source === "RESUME" && <span className="badge mt-1 inline-block">{e.confirmed ? "from resume" : "from resume · review"}</span>}
                  </div>
                  <form action={deleteEducation.bind(null, e.id)}><button className="btn-ghost text-danger" type="submit">Remove</button></form>
                </div>
              ))}
              <form action={addEducation} className="card space-y-4 p-5">
                <p className="font-medium">Add education</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input name="school" label="Institution *" />
                  <Input name="degree" label="Qualification / degree" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input name="field" label="Field / major" />
                  <Select name="graduationStatus" label="Status" options={[["", "—"], ["completed", "Completed"], ["in_progress", "In progress"], ["expected", "Expected"]]} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input name="startDate" label="Start (free text)" placeholder="Sep 2019" />
                  <Input name="endDate" label="End (free text)" placeholder="Jun 2023" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input name="grade" label="Grade / CGPA / %" hint="Kept exactly as you enter it — never converted." />
                  <Input name="gradeScale" label="Grading scale" placeholder="e.g. CGPA 10, GPA 4.0, percentage" />
                </div>
                <SubmitButton pendingText="Adding…">Add education</SubmitButton>
              </form>
            </div>
          )}

          {/* ---------- EXPERIENCE ---------- */}
          {active === "experience" && (
            <div className="space-y-4">
              {profile?.experience.map((x) => (
                <div key={x.id} className="card flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-ink">{x.title} · {x.company}</p>
                    <p className="text-ink-muted">{[x.location, [x.startDate, x.current ? "Present" : x.endDate].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}</p>
                    {x.highlights.length > 0 && <ul className="mt-1 list-disc pl-4 text-ink-muted">{x.highlights.slice(0, 4).map((h, i) => <li key={i}>{h}</li>)}</ul>}
                  </div>
                  <form action={deleteExperience.bind(null, x.id)}><button className="btn-ghost text-danger" type="submit">Remove</button></form>
                </div>
              ))}
              <form action={addExperience} className="card space-y-4 p-5">
                <p className="font-medium">Add experience</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input name="company" label="Employer *" />
                  <Input name="title" label="Title *" />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Input name="location" label="Location" />
                  <Input name="startDate" label="Start" placeholder="Apr 2022" />
                  <Input name="endDate" label="End" placeholder="Present" />
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="current" className="h-4 w-4 accent-brick" /> I currently work here</label>
                <div>
                  <label className="label" htmlFor="highlights">Responsibilities & achievements (one per line)</label>
                  <textarea id="highlights" name="highlights" rows={4} className="input" placeholder={"Built X that did Y\nLed a team of N"} />
                </div>
                <SubmitButton pendingText="Adding…">Add experience</SubmitButton>
              </form>
            </div>
          )}

          {/* ---------- SKILLS & PROJECTS ---------- */}
          {active === "skills" && (
            <div className="space-y-6">
              <div className="card p-5">
                <p className="font-medium">Skills</p>
                {profile && profile.skills.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {profile.skills.map((sk) => (
                      <form key={sk.id} action={deleteSkill.bind(null, sk.id)}>
                        <button type="submit" className="badge hover:opacity-70" title="Remove">{sk.name} ✕</button>
                      </form>
                    ))}
                  </div>
                )}
                <form action={addSkill} className="mt-4 flex flex-wrap items-end gap-3">
                  <div className="grow"><Input name="name" label="Add skills (comma-separated)" placeholder="Python, PyTorch, SQL" /></div>
                  <SubmitButton pendingText="Adding…">Add</SubmitButton>
                </form>
              </div>

              <div className="space-y-4">
                <p className="font-medium">Projects</p>
                {profile?.projects.map((pj) => (
                  <div key={pj.id} className="card flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium text-ink">{pj.name}</p>
                      {pj.description && <p className="text-ink-muted">{pj.description}</p>}
                      {pj.technologies.length > 0 && <p className="mt-1 text-xs text-ink-muted">{pj.technologies.join(" · ")}</p>}
                    </div>
                    <form action={deleteProject.bind(null, pj.id)}><button className="btn-ghost text-danger" type="submit">Remove</button></form>
                  </div>
                ))}
                <form action={addProject} className="card space-y-4 p-5">
                  <Input name="name" label="Project name *" />
                  <div><label className="label" htmlFor="description">Description</label><textarea id="description" name="description" rows={3} className="input" /></div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input name="technologies" label="Technologies (comma-separated)" placeholder="React, Node, Postgres" />
                    <Input name="url" label="Link" placeholder="https://…" />
                  </div>
                  <Input name="outcome" label="Verifiable outcome" placeholder="e.g. 1,200+ downloads" />
                  <SubmitButton pendingText="Adding…">Add project</SubmitButton>
                </form>
              </div>
            </div>
          )}

          {/* ---------- CERTIFICATIONS ---------- */}
          {active === "certifications" && (
            <div className="space-y-4">
              {profile?.certifications.map((c) => (
                <div key={c.id} className="card flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-ink">{c.name}{c.issuer ? ` · ${c.issuer}` : ""}</p>
                    <p className="text-ink-muted">{[[c.issueDate, c.expiryDate].filter(Boolean).join(" – "), c.credentialId].filter(Boolean).join(" · ")}</p>
                  </div>
                  <form action={deleteCertification.bind(null, c.id)}><button className="btn-ghost text-danger" type="submit">Remove</button></form>
                </div>
              ))}
              <form action={addCertification} className="card space-y-4 p-5">
                <p className="font-medium">Add certification</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input name="name" label="Name *" />
                  <Input name="issuer" label="Issuing organization" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input name="issueDate" label="Issued" placeholder="Mar 2024" />
                  <Input name="expiryDate" label="Expires" placeholder="Mar 2027 (if any)" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input name="credentialId" label="Credential ID" />
                  <Input name="url" label="Credential link" />
                </div>
                <SubmitButton pendingText="Adding…">Add certification</SubmitButton>
              </form>
            </div>
          )}

          {/* ---------- QUESTIONS ---------- */}
          {active === "questions" && (
            <form action={saveSection.bind(null, "questions")} className="card space-y-4 p-5">
              <p className="text-sm text-ink-muted">Common factual application questions. Leave anything blank you are unsure of — it is never guessed for you.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input name="authCountry" label="Work authorization — country" value={firstAuth?.[0]} placeholder="e.g. US, UK, India" />
                <Input name="authStatus" label="Authorization status" value={firstAuth?.[1]} placeholder="e.g. citizen, permanent resident, needs visa" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select name="needsSponsorship" label="Do you need sponsorship?" value={triVal(profile?.needsSponsorship)} options={[["", "Prefer not to say / unsure"], ["yes", "Yes"], ["no", "No"]]} />
                <Input name="yearsExperience" label="Years of experience" value={profile?.yearsExperience != null ? String(profile.yearsExperience) : ""} type="number" />
              </div>
              <Input name="availabilityDate" label="Availability / earliest start" value={profile?.availabilityDate} placeholder="e.g. Immediately, 2 weeks, 1 Aug" />
              <SubmitButton pendingText="Saving…">Save &amp; continue</SubmitButton>
            </form>
          )}

          {/* ---------- DECLARATIONS (sensitive, optional) ---------- */}
          {active === "declarations" && (
            <form action={saveSection.bind(null, "declarations")} className="card space-y-4 p-5">
              <div className="rounded-md border border-stone-200 bg-surface-2 px-3 py-2 text-sm text-ink-muted">
                These are optional and sensitive. They are <strong>never required</strong>, never inferred, and do
                <strong> not</strong> affect your completion score. Share only what you choose, per application.
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select name="gender" label="Gender" value={profile?.gender} options={[["", "Not provided"], ["female", "Female"], ["male", "Male"], ["nonbinary", "Non-binary"], ["self_describe", "Prefer to self-describe"], ["prefer_not", "Prefer not to say"]]} />
                <Select name="veteranStatus" label="Veteran status" value={profile?.veteranStatus} options={[["", "Not provided"], ["veteran", "Veteran"], ["not_veteran", "Not a veteran"], ["prefer_not", "Prefer not to say"]]} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select name="disabilityStatus" label="Disability status" value={profile?.disabilityStatus} options={[["", "Not provided"], ["yes", "Yes"], ["no", "No"], ["prefer_not", "Prefer not to say"]]} />
                <Input name="ethnicity" label="Race / ethnicity" value={profile?.ethnicity} placeholder="Leave blank unless you choose to share" />
              </div>
              <SubmitButton pendingText="Saving…">Save</SubmitButton>
            </form>
          )}

          {/* ---------- DOCUMENTS ---------- */}
          {active === "documents" && (
            <div className="card p-5">
              <p className="text-sm text-ink-muted">Upload a PDF or DOCX. We extract the text to power autofill and tailoring. Files are private; only you can download them. Max 5 MB.</p>
              <form method="post" action="/api/resumes" encType="multipart/form-data" className="mt-4 flex flex-wrap items-center gap-3">
                <input type="file" name="resume" accept={ACCEPT_ATTR} required className="text-sm file:mr-3 file:rounded-md file:border file:border-stone-300 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink" />
                <button type="submit" className="btn-primary">Upload resume</button>
              </form>
              {resumes.length > 0 && (
                <ul className="mt-5 divide-y divide-stone-200 border-t border-stone-200">
                  {resumes.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.filename}</p>
                        <p className="text-xs text-ink-muted">{r.parsedText ? "text extracted" : "no text extracted"} · {r.createdAt.toLocaleDateString()}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <a href={`/api/resumes/${r.id}/download`} className="btn-ghost no-underline">Download</a>
                        <form action={deleteResumeAction.bind(null, r.id)}><button type="submit" className="btn-ghost text-danger">Delete</button></form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      <AnswerBank userId={user.id} tailorPerJob={!!profile?.tailorPerJob} subscribed={subscribed} />
    </div>
  );
}
