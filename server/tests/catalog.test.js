import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parseCurriculum } from "../lib/nitw-curriculum.js";
import { validateReview } from "../services/reviews.js";

test("curriculum extraction handles wrapped headers and never guesses missing credits", () => {
  const content = `1st Semester\n1 CS1101 Programming and Data Structures  3-0-0 3\n2 CS1308 Cryptography and Network Security Laboratory  0-1-2 2\nProfessional Elective-I\n1 CS1338 Mobile Computing\n2 CS13XX Elective slot\n\fCS1101  3-0-0 (3)\nProgramming and Data Structures\nPre-Requisites: None\n\fCS1308\n  0-1-2 (2)\nCryptography and Network Security Laboratory\nPre-Requisites: None`;
  const rows = parseCurriculum(content);
  assert.equal(rows.length, 3);
  assert.equal(
    rows.find((row) => row.code === "CS1308").name,
    "Cryptography and Network Security Laboratory",
  );
  assert.equal(rows.find((row) => row.code === "CS1338").credits, undefined);
  assert.equal(
    rows.find((row) => row.code === "CS1101").semester,
    "Semester 1",
  );
});

test("official snapshot has unique identities, valid references and complete scheme coverage", async () => {
  const catalog = JSON.parse(
    await fs.readFile(
      new URL("../../shared/nitwCatalog.json", import.meta.url),
    ),
  );
  const report = JSON.parse(
    await fs.readFile(
      new URL("../../docs/NITW_IMPORT_REPORT.json", import.meta.url),
    ),
  );
  assert.equal(catalog.departments.length, report.departments.length);
  assert.equal(report.programs.length, report.totals.curriculumDocuments);
  assert.ok(
    report.programs.every(
      (program) => program.uncapturedSummaryCodes.length === 0,
    ),
  );
  assert.ok(
    report.departments.every(
      (department) => department.facultyCards === department.extracted,
    ),
  );
  for (const kind of ["departments", "professors", "courses"])
    assert.equal(
      new Set(catalog[kind].map((row) => row.id)).size,
      catalog[kind].length,
    );
  const departments = new Set(catalog.departments.map((row) => row.id));
  assert.ok(
    [...catalog.professors, ...catalog.courses].every((row) =>
      departments.has(row.departmentId),
    ),
  );
  assert.ok(
    catalog.courses.every(
      (row) =>
        row.name &&
        (row.credits === null ||
          (Number.isFinite(row.credits) &&
            row.credits >= 0 &&
            row.credits <= 10)),
    ),
  );
  const professors = new Set(catalog.professors.map((row) => row.id)),
    courses = new Set(catalog.courses.map((row) => row.id));
  assert.ok(
    catalog.assignments.every(
      (row) =>
        professors.has(row.professorId) &&
        courses.has(row.courseId) &&
        row.sourceUrl.startsWith("https://erp.nitw.ac.in/"),
    ),
  );
  assert.equal(
    new Set(
      catalog.assignments.map((row) => `${row.professorId}/${row.courseId}`),
    ).size,
    catalog.assignments.length,
  );
});

test("review validation preserves plain text and rejects malformed values", () => {
  const body = {
    professorId: "professor",
    courseId: "course",
    semester: "Spring 2025",
    ratings: [1, 2, 3, 4, 5, 4],
    tags: [],
    text: "  Useful examples.  ",
    confirmed: true,
  };
  assert.equal(validateReview(body).text, "Useful examples.");
  assert.equal(validateReview({ ...body, text: "" }).text, "");
  for (const invalid of [
    { ratings: [1, 2, 3, 4, 5, 0] },
    { ratings: [1, 2, 3, 4, 5, 1.5] },
    { tags: ["Helpful", "Helpful"] },
    { confirmed: "true" },
    { text: "bad\u0000text" },
  ])
    assert.throws(() => validateReview({ ...body, ...invalid }));
});
