// Parse the curriculum's compact scheme tables, then fill elective credits
// from the detailed syllabus headers. Keep exceptions visible in the report.
export function parseCurriculum(content) {
  const lines = content.replace(/[–—−]/g, "-").split("\n"),
    courses = new Map(),
    details = new Map();
  const codePattern = "([A-Z]{2,3}\\s*\\d[A-Z0-9]{3,5})";
  const header = new RegExp(
    `^\\s*${codePattern}\\s+.*?(?:\\(\\s*|:\\s*)(\\d+(?:\\.\\d+)?)\\s*\\)?\\s*$`,
  );
  const row = new RegExp(`^\\s*(?:\\d+[.)]?\\s+)?${codePattern}\\b\\s*(.*)$`);
  const clean = (value) => value.replace(/\s+/g, " ").trim();
  let firstDetail = lines.length,
    page = 1;
  lines.forEach((line, index) => {
    page += (line.match(/\f/g) || []).length;
    const nextLineHeader =
      /^\s*[A-Z]{2,3}\s*\d[A-Z0-9]{3,5}\s*$/.test(line) &&
      /\d\s*-\s*\d\s*-\s*\d/.test(lines[index + 1] || "");
    const headerLine = nextLineHeader
      ? `${line.trim()} ${lines[index + 1]}`
      : line;
    const match = headerLine.match(header);
    if (!match || !/\d\*?\s*-\s*\d\s*-\s*\d/.test(headerLine)) return;
    firstDetail = Math.min(firstDetail, index);
    const name = [];
    for (const next of lines.slice(
      index + (nextLineHeader ? 2 : 1),
      index + 8,
    )) {
      if (
        /Pre.?Requisites?|Course Outcomes?|Syllabus:|Course Objectives?/i.test(
          next,
        )
      )
        break;
      if (/\d+\s*\|\s*P\s*a\s*g\s*e|Department of/i.test(next)) continue;
      if (next.trim()) name.push(next.trim());
      else if (name.length) break;
    }
    if (name.length)
      details.set(match[1].replace(/\s/g, ""), {
        name: clean(name.join(" ")),
        credits: Number(match[2]),
        page,
      });
  });
  let semester = "Not specified";
  page = 1;
  for (let index = 0; index < firstDetail; index++) {
    const line = lines[index];
    page += (line.match(/\f/g) || []).length;
    const term = line.match(/\b([1-8])(?:st|nd|rd|th)\s+Semester/i);
    if (term) semester = `Semester ${term[1]}`;
    if (/Professional Elective|Minor Degree|Honors|Honours/i.test(line))
      semester = "Not specified";
    const match = line.match(row);
    if (!match) continue;
    const code = match[1].replace(/\s/g, "");
    if (/[X]/.test(code) || courses.has(code)) continue;
    const detail = details.get(code),
      tail = match[2];
    const ltp = tail.match(/\d\*?\s*-\s*\d\s*-\s*\d\s+(\d+(?:\.\d+)?)/);
    let name = clean(ltp ? tail.slice(0, ltp.index) : tail.split(/\s{2,}/)[0]);
    // Some table titles wrap onto the next line; detailed headers are clearer.
    if (!detail) {
      const previous = lines[index - 1] || "";
      if (
        /^\s{12,}[A-Za-z]/.test(previous) &&
        !/Total|Semester|Credits|Course|Department/i.test(previous) &&
        !row.test(previous)
      )
        name = `${clean(previous)} ${name}`.trim();
      const next = lines[index + 1] || "";
      if (
        /^\s{15,}[A-Za-z]/.test(next) &&
        !/Total|Semester|Credits|Course|Department/i.test(next) &&
        !row.test(next)
      )
        name += ` ${clean(next)}`;
    }
    courses.set(code, {
      code,
      name: detail?.name || name,
      credits: ltp ? Number(ltp[1]) : detail?.credits,
      semester,
      page,
    });
  }
  // Definitions absent from the summary still carry an official code/title/credit.
  for (const [code, detail] of details)
    if (!courses.has(code))
      courses.set(code, { code, ...detail, semester: "Not specified" });
  return [...courses.values()];
}
