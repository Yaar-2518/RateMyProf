// Run explicitly: npm run catalog:collect. Public data only; no login required.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { projectRoot } from "../config.js";
import { parseCurriculum } from "../lib/nitw-curriculum.js";

const run = promisify(execFile),
  base = "https://nitw.ac.in";
const cache = path.join(projectRoot, ".local/nitw");
const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const departmentsByPrefix = {
  BT: "bio",
  CH: "chem",
  CY: "che",
  CE: "ce",
  CD: "cds",
  CS: "cse",
  EE: "eee",
  EC: "ece",
  HS: "hss",
  MS: "som",
  MA: "math",
  ME: "mec",
  MM: "mme",
  PH: "physics",
  PY: "physics",
};
const codes = {
  bio: "BT",
  chem: "CH",
  che: "CY",
  ce: "CE",
  cds: "CDS",
  cse: "CSE",
  education: "EDU",
  eee: "EEE",
  ece: "ECE",
  hss: "HSS",
  som: "SOM",
  math: "MATH",
  mec: "ME",
  mme: "MME",
  physics: "PHY",
};
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${response.status} fetching ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
await fs.mkdir(path.join(cache, "pdfs"), { recursive: true, mode: 0o700 });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const report = {
  collectedAt: new Date().toISOString(),
  departmentIndex: `${base}/departments`,
  curriculumIndex: `${base}/path/?dept=/NewBTechCurriculum`,
  departments: [],
  programs: [],
  conflicts: [],
  excluded: [],
  unmatchedTeaching: [],
};
try {
  let reviewedNames = [],
    previousPrograms = [];
  try {
    const previous = JSON.parse(
      await fs.readFile(
        path.join(projectRoot, "docs/NITW_IMPORT_REPORT.json"),
        "utf8",
      ),
    );
    reviewedNames = previous.manualIdentityReviews || [];
    previousPrograms = previous.programs || [];
  } catch {}
  report.manualIdentityReviews = reviewedNames;
  const page = await browser.newPage();
  // Ignore images and unrelated third-party widgets; only official public text.
  await page.route("**/*", (route) => {
    const request = route.request(),
      host = new URL(request.url()).hostname;
    if (
      !host.endsWith("nitw.ac.in") ||
      ["image", "font", "media"].includes(request.resourceType())
    )
      return route.abort();
    return route.continue();
  });
  await page.goto(`${base}/departments`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".department-title");
  const departments = await page
    .locator(".department-title")
    .evaluateAll((elements) =>
      elements.map((element) => ({
        name: element.textContent.trim(),
        sourceUrl: element.parentElement.querySelector("a").href,
      })),
    );
  let professors = [];
  for (const department of departments) {
    department.id = new URL(department.sourceUrl).pathname
      .split("/")
      .filter(Boolean)[0];
    department.code = codes[department.id];
    if (!department.code)
      throw new Error(`Unrecognized official department: ${department.name}`);
    await page.goto(department.sourceUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#nav-faculty", { state: "attached" });
    await fs.writeFile(
      path.join(cache, `${department.id}-roster.html`),
      await page.content(),
      { mode: 0o600 },
    );
    const roster = await page
      .locator("#v-pills-Faculty")
      .evaluate((element) => {
        const headings = [
          ...element.querySelectorAll(
            "#nav-faculty h5, #nav-AdjunctFaculty h5",
          ),
        ];
        return {
          headingCount: headings.length,
          faculty: headings.map((heading) => {
            const card = heading.closest(".data") || heading.parentElement;
            return {
              name: heading.textContent.replace(/\s+/g, " ").trim(),
              designation:
                card.querySelector(":scope > span")?.textContent.trim() ||
                "Faculty",
              sourceUrl: heading.querySelector("a[href]")?.href || "",
            };
          }),
        };
      });
    for (const faculty of roster.faculty) {
      if (!faculty.name || !faculty.designation)
        throw new Error(`Incomplete faculty card in ${department.name}`);
      faculty.id = `nitw-${digest(faculty.sourceUrl || `${department.id}/${faculty.name}`).slice(0, 20)}`;
      faculty.departmentId = department.id;
      faculty.rosterUrl = department.sourceUrl;
      faculty.designation = faculty.designation.replace(/\s+/g, " ");
      professors.push(faculty);
    }
    report.departments.push({
      name: department.name,
      sourceUrl: department.sourceUrl,
      facultyCards: roster.headingCount,
      extracted: roster.faculty.length,
    });
    console.log(`${department.name}: ${roster.faculty.length} faculty cards`);
  }
  // Education also lists colleagues from other departments. A person with one
  // ERP identity must remain one professor, even when several rosters list them.
  const uniqueFaculty = new Map();
  for (const professor of professors) {
    const existing = uniqueFaculty.get(professor.id);
    const prefix = professor.sourceUrl
      .split("/")
      .pop()
      ?.split("-")[0]
      ?.toUpperCase();
    const home = departmentsByPrefix[prefix];
    if (
      !existing ||
      (professor.departmentId === home && existing.departmentId !== home)
    )
      uniqueFaculty.set(professor.id, professor);
  }
  report.rosterEntries = professors.length;
  professors = [...uniqueFaculty.values()];
  // Obtain the current central list, not the historical archive tab.
  const indexResponse = await fetch(`${base}/api/path/view`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "/NewBTechCurriculum" }),
    signal: AbortSignal.timeout(30000),
  });
  if (!indexResponse.ok)
    throw new Error("Could not read the official curriculum index.");
  const index = await indexResponse.json();
  const current = index.find(
    (tab) => tab.tab_header === "New B.Tech Curriculum",
  );
  if (!current) throw new Error("Current B.Tech curriculum tab is missing.");
  const programs = await page.evaluate(
    (content) => {
      const doc = new DOMParser().parseFromString(content, "text/html");
      return [...doc.querySelectorAll('a[href$=".pdf"]')].map((a) => ({
        name: a.textContent.replace(/\s+/g, " ").trim(),
        sourceUrl: a.href,
      }));
    },
    current.tab_content.blocks
      .filter((block) => block.type === "table")
      .flatMap((block) => block.data.content.flat())
      .join("\n"),
  );
  if (!programs.length)
    throw new Error("No current B.Tech curriculum PDFs found.");
  const coursesByCode = new Map();
  const normalizeTitle = (name) =>
    name
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/\blab\b/g, "laboratory")
      .replace(/[^a-z0-9]/g, "");
  for (const program of programs) {
    const file = path.join(cache, "pdfs", `${slug(program.name)}.pdf`),
      textFile = file.replace(/\.pdf$/, ".txt");
    const bytes = process.argv.includes("--cached")
      ? await fs.readFile(file)
      : await download(program.sourceUrl);
    if (
      process.argv.includes("--cached") &&
      !previousPrograms.some(
        (source) =>
          source.sourceUrl === program.sourceUrl &&
          source.sha256 === digest(bytes),
      )
    )
      throw new Error(
        `Cached PDF does not match its recorded source: ${program.name}. Run without --cached.`,
      );
    await fs.writeFile(file, bytes);
    await run(process.env.PDFTOTEXT_PATH || "pdftotext", [
      "-layout",
      file,
      textFile,
    ]);
    const content = await fs.readFile(textFile, "utf8"),
      parsed = parseCurriculum(content);
    const programReport = {
      ...program,
      sha256: digest(bytes),
      pages: content.split("\f").length - 1,
      courseCodes: parsed.length,
      unknownCredits: [],
      zeroCreditEntries: [],
      excluded: [],
      uncapturedSummaryCodes: [],
    };
    // Independent token scan checks that no coded scheme entry was skipped.
    const firstDefinition = content.search(
      /^\s*[A-Z]{2,3}\s*\d[A-Z0-9]{3,5}\s+.*?\d\*?[-–]\d[-–]\d\s*\(/m,
    );
    const summaryCodes = new Set(
      [
        ...content
          .slice(0, firstDefinition < 0 ? content.length : firstDefinition)
          .matchAll(/\b([A-Z]{2,3}\s*\d[A-Z0-9]{3,5})\b/g),
      ]
        .map((match) => match[1].replace(/\s/g, ""))
        .filter((code) => !code.includes("X")),
    );
    programReport.uncapturedSummaryCodes = [...summaryCodes].filter(
      (code) => !parsed.some((entry) => entry.code === code),
    );
    if (programReport.uncapturedSummaryCodes.length)
      throw new Error(`Uncaptured scheme codes in ${program.name}`);
    for (const entry of parsed) {
      const departmentId = departmentsByPrefix[entry.code.match(/^[A-Z]+/)[0]];
      if (!departmentId) {
        const excluded = {
          code: entry.code,
          program: program.name,
          reason:
            "Non-academic institute activity or unknown owning department",
        };
        report.excluded.push(excluded);
        programReport.excluded.push(entry.code);
        continue;
      }
      if (!entry.name || entry.name.length > 100)
        throw new Error(
          `Unresolved course title: ${entry.code} in ${program.name}`,
        );
      if (entry.credits === undefined)
        programReport.unknownCredits.push(entry.code);
      if (entry.credits === 0) programReport.zeroCreditEntries.push(entry.code);
      const course = {
        id: entry.code.toLowerCase(),
        code: entry.code,
        name: entry.name,
        departmentId,
        credits: entry.credits ?? null,
        semester: entry.semester,
        sourceUrl: program.sourceUrl,
        sourcePage: entry.page,
      };
      const existing = coursesByCode.get(course.code);
      if (!existing) coursesByCode.set(course.code, course);
      else {
        const normalize = normalizeTitle;
        if (
          normalize(existing.name) !== normalize(course.name) ||
          (existing.credits !== null &&
            course.credits !== null &&
            existing.credits !== course.credits)
        )
          report.conflicts.push({
            code: course.code,
            kept: {
              name: existing.name,
              credits: existing.credits,
              sourceUrl: existing.sourceUrl,
            },
            alternative: {
              name: course.name,
              credits: course.credits,
              sourceUrl: course.sourceUrl,
            },
            reason:
              "Published sources disagree; retain first central-index entry, preserve both in report",
          });
        if (
          existing.credits === null &&
          course.credits !== null &&
          normalize(existing.name) === normalize(course.name)
        )
          existing.credits = course.credits;
      }
    }
    report.programs.push(programReport);
    console.log(`${program.name}: ${parsed.length} published course codes`);
  }
  const courses = [...coursesByCode.values()].sort((a, b) =>
    a.code.localeCompare(b.code),
  );
  // Cross-check faculty identities and extract ONLY explicitly published UG courses.
  const assignments = [],
    profileChecks = [];
  for (let offset = 0; offset < professors.length; offset += 3) {
    const batch = await Promise.all(
      professors.slice(offset, offset + 3).map(async (professor) => {
        if (
          !professor.sourceUrl.startsWith("https://erp.nitw.ac.in/ext/profile/")
        )
          return {
            professor,
            skipped: "No official ERP profile link on roster",
          };
        try {
          const profileFile = path.join(cache, `${professor.id}.html`);
          let html;
          try {
            if (!process.argv.includes("--cached")) throw new Error("Refresh");
            html = await fs.readFile(profileFile, "utf8");
          } catch {
            html = (await download(professor.sourceUrl)).toString("utf8");
            await fs.writeFile(profileFile, html, { mode: 0o600 });
          }
          const extracted = await page.evaluate((html) => {
            const doc = new DOMParser().parseFromString(html, "text/html");
            return {
              title: doc.title,
              names: [
                ...doc.querySelectorAll("h1,h2,h3,h4,h5,.profile-name"),
              ].map((e) => e.textContent.replace(/\s+/g, " ").trim()),
              teaching: [
                ...doc.querySelectorAll(".course-handled-table tbody tr"),
              ].map((row) =>
                [...row.querySelectorAll("td")].map((cell) =>
                  cell.textContent.replace(/\s+/g, " ").trim(),
                ),
              ),
            };
          }, html);
          return { professor, extracted, sha256: digest(html) };
        } catch (error) {
          return { professor, error: error.message };
        }
      }),
    );
    for (const { professor, extracted, error, skipped, sha256 } of batch) {
      const tokens = (name) =>
        name
          .toLowerCase()
          .replace(/\b(professor|prof|dr)\b\.?/g, "")
          .replace(/[^a-z0-9]/g, " ")
          .trim()
          .split(/\s+/);
      const sameName = (a, b) => {
        const left = tokens(a),
          right = tokens(b);
        if (left.join("") === right.join("")) return true;
        if (
          left.length !== right.length ||
          !left.some((word) => word.length > 1 && right.includes(word))
        )
          return false;
        const match = (remaining, available) =>
          !remaining.length ||
          available.some(
            (word, index) =>
              (remaining[0] === word ||
                (remaining[0].length === 1 && word.startsWith(remaining[0])) ||
                (word.length === 1 && remaining[0].startsWith(word))) &&
              match(
                remaining.slice(1),
                available.filter((_, position) => position !== index),
              ),
          );
        return match(left, right);
      };
      const nameVerified = extracted?.names.some((name) =>
        sameName(name, professor.name),
      );
      const reviewed = reviewedNames.some(
        (entry) =>
          entry.sourceUrl === professor.sourceUrl &&
          entry.rosterName === professor.name &&
          entry.profileName === extracted?.names[0],
      );
      profileChecks.push({
        professorId: professor.id,
        sourceUrl: professor.sourceUrl,
        nameVerified: Boolean(nameVerified),
        profileName: extracted?.names[0] || null,
        reviewedNameVariation: reviewed,
        sha256,
        ...(error || skipped ? { issue: error || skipped } : {}),
      });
      for (const cells of extracted?.teaching || []) {
        if (cells[3] !== "UG") continue;
        const code = cells[0]
          .match(/\(([A-Z]{2,3}\s*\d[A-Z0-9]{2,5})\)/)?.[1]
          .replace(/\s/g, "");
        if (
          code &&
          coursesByCode.has(code) &&
          normalizeTitle(cells[0].replace(/\([^)]*\)\s*$/, "")) ===
            normalizeTitle(coursesByCode.get(code).name)
        )
          assignments.push({
            professorId: professor.id,
            courseId: coursesByCode.get(code).id,
            sourceUrl: professor.sourceUrl,
          });
        else
          report.unmatchedTeaching.push({
            professorId: professor.id,
            title: cells[0],
            sourceUrl: professor.sourceUrl,
            reason:
              code && coursesByCode.has(code)
                ? "Official teaching title differs from the current curriculum title"
                : "No exact course-code match in current B.Tech catalog",
          });
      }
    }
    if (offset % 30 === 0 || offset + 3 >= professors.length)
      console.log(
        `Verified profiles ${Math.min(offset + 3, professors.length)}/${professors.length}`,
      );
  }
  report.profileChecks = profileChecks;
  const uniqueAssignments = [
    ...new Map(
      assignments.map((row) => [`${row.professorId}/${row.courseId}`, row]),
    ).values(),
  ];
  if (new Set(professors.map((p) => p.id)).size !== professors.length)
    throw new Error("Duplicate faculty IDs in official roster.");
  const catalog = {
    collectedAt: report.collectedAt,
    departments,
    professors,
    courses,
    assignments: uniqueAssignments,
  };
  report.totals = {
    departments: departments.length,
    facultyCards: report.rosterEntries,
    professors: professors.length,
    courses: courses.length,
    teachingAssignments: uniqueAssignments.length,
    curriculumDocuments: programs.length,
    verifiedProfileNames: profileChecks.filter((p) => p.nameVerified).length,
    reviewedNameVariations: profileChecks.filter((p) => p.reviewedNameVariation)
      .length,
    profileIssues: profileChecks.filter((p) => p.issue).length,
  };
  // Write only after all department/PDF extraction succeeds. Raw pages stay local.
  await fs.writeFile(
    path.join(projectRoot, "shared/nitwCatalog.json"),
    JSON.stringify(catalog, null, 2) + "\n",
  );
  await fs.writeFile(
    path.join(projectRoot, "docs/NITW_IMPORT_REPORT.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report.totals));
} finally {
  await browser.close();
}
