const normalize = value => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

// Do not enumerate a large catalog until the person has entered a query.
export function searchOptions(options, query, limit = 8) {
  const search = normalize(query);
  if (!search) return { matches: [], total: 0 };
  const words = search.split(/\s+/);
  const ranked = options.map((option, index) => {
    const label = normalize(option.label);
    const haystack = normalize(`${option.label} ${option.description || ""} ${option.searchText || ""}`);
    return { option, index, rank: label === search ? 0 : label.startsWith(search) ? 1 : 2,
      matches: words.every(word => haystack.includes(word)) };
  }).filter(item => item.matches).sort((a, b) => a.rank - b.rank || a.index - b.index);
  return { matches: ranked.slice(0, limit).map(item => item.option), total: ranked.length };
}

export const courseOptions = courses => courses.map(course => ({
  value: course.id, label: `${course.code} · ${course.name}`, description: course.department,
}));
export const professorOptions = professors => professors.map(professor => ({
  value: professor.id, label: professor.name, description: professor.department,
}));
