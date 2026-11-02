import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import React from "react";
import { searchOptions } from "../lib/searchOptions.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:5173" });
for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "MutationObserver"])
  Object.defineProperty(globalThis, name, { value: name === "window" ? dom.window : name === "document" ? dom.window.document : dom.window[name], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, cleanup } = await import("@testing-library/react");
const vite = await createServer({ root: fileURLToPath(new URL("../../", import.meta.url)), configFile: false, cacheDir: ".local/vite-ui-tests",
  esbuild: { jsx: "automatic" }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
const { default: SearchSelect } = await vite.ssrLoadModule("/src/components/SearchSelect.jsx");
const h = React.createElement;
const options = [
  { value: "cs1206", label: "CS1206 · Database Management Systems", description: "Computer Science" },
  { value: "cs2206", label: "CS2206 · Database Systems", description: "Computer Science" },
  { value: "ma1101", label: "MA1101 · Calculus", description: "Mathematics" },
];
const nativeFetch = globalThis.fetch;
afterEach(() => { cleanup(); globalThis.fetch = nativeFetch; });
after(async () => { await vite.close(); dom.window.close(); });
function Harness(props = {}) {
  const [value, setValue] = React.useState(props.initialValue || "");
  return h("form", {}, h(SearchSelect, { label: "Course", options, required: true, ...props, value, onChange: setValue }), h("span", { "data-testid": "selection" }, value));
}
function type(input, value) { fireEvent.change(input, { target: { value } }); }

test("search does not list the entire catalog before typing and matches partial names/codes", () => {
  assert.deepEqual(searchOptions(options, " ").matches, []);
  assert.equal(searchOptions(options, "cs 1206").matches[0].value, "cs1206");
  assert.equal(searchOptions(options, "database management").total, 1);
  assert.equal(searchOptions(options, "DATA").total, 2);
  assert.equal(searchOptions([{ value: "p", label: "Prof. José Sharma" }], "jose sha").total, 1);
});

test("focusing an empty selector does not render options; typing shows matches", () => {
  render(h(Harness));
  const input = screen.getByRole("combobox", { name: "Course" });
  fireEvent.focus(input);
  assert.equal(screen.queryByRole("listbox"), null);
  type(input, "database");
  assert.equal(screen.getAllByRole("option").length, 2);
  assert.equal(input.getAttribute("aria-expanded"), "true");
  fireEvent.click(screen.getByRole("option", { name: /CS1206/ }));
  assert.equal(screen.getByTestId("selection").textContent, "cs1206");
  assert.equal(input.value, options[0].label);
  assert.equal(input.checkValidity(), true);
  assert.equal(screen.queryByRole("listbox"), null);
});

test("keyboard navigation selects results and Escape closes without committing text", () => {
  render(h(Harness));
  const input = screen.getByRole("combobox", { name: "Course" });
  type(input, "database");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  const activeId = input.getAttribute("aria-activedescendant");
  assert.ok(document.getElementById(activeId).textContent.includes("CS2206"));
  fireEvent.keyDown(input, { key: "Enter" });
  assert.equal(screen.getByTestId("selection").textContent, "cs2206");
  type(input, "calc");
  assert.equal(screen.getByTestId("selection").textContent, "");
  assert.equal(input.value, "calc");
  fireEvent.keyDown(input, { key: "Escape" });
  assert.equal(screen.queryByRole("listbox"), null);
  assert.equal(input.checkValidity(), false);
});

test("clearing a prefilled selection resets its ID and supports replacing the first character", () => {
  render(h(Harness, { initialValue: "cs1206" }));
  const input = screen.getByRole("combobox", { name: "Course" });
  assert.equal(input.value, options[0].label);
  type(input, "m");
  assert.equal(input.value, "m");
  assert.equal(screen.getByTestId("selection").textContent, "");
  fireEvent.click(screen.getByRole("button", { name: "Clear course" }));
  assert.equal(input.value, "");
  assert.equal(input.checkValidity(), false);
});

test("large searches show only eight results, announce no matches, and close on blur", () => {
  render(h(Harness, { options: Array.from({ length: 30 }, (_, i) => ({ value: `c-${i}`, label: `Course ${i}` })) }));
  const input = screen.getByRole("combobox", { name: "Course" });
  type(input, "course");
  assert.equal(screen.getAllByRole("option").length, 8);
  assert.match(screen.getByRole("status").textContent, /30 matches.*Showing 8/);
  fireEvent.blur(input, { relatedTarget: document.body });
  assert.equal(screen.queryByRole("listbox"), null);
  type(input, "zzzz");
  assert.equal(screen.queryByRole("listbox"), null);
  assert.match(screen.getByRole("status").textContent, /No matches/);
});

test("actual review form restricts courses to the selected professor and resets on professor change", async () => {
  const professors = [
    { id: "prof-one", name: "Professor One", department: "Computer Science", courses: ["cs1206"], initials: "PO" },
    { id: "prof-two", name: "Professor Two", department: "Mathematics", courses: ["ma1101"], initials: "PT" },
  ];
  const courses = [{ id: "cs1206", code: "CS1206", name: "Database Management Systems", department: "Computer Science" },
    { id: "ma1101", code: "MA1101", name: "Calculus", department: "Mathematics" }];
  globalThis.fetch = async path => new Response(JSON.stringify(String(path).endsWith("/auth/session") ?
    { user: { id: "ui-student", role: "student" }, csrfToken: "test", studentDomains: ["student.nitw.ac.in"] } :
    String(path).endsWith("/catalog") ? { professors, courses, departments: [] } :
    String(path).endsWith("/votes") ? { votes: {} } : { reviews: [] }), { headers: { "Content-Type": "application/json" } });
  const { AuthProvider } = await vite.ssrLoadModule("/src/context/AuthContext.jsx");
  const { DataProvider } = await vite.ssrLoadModule("/src/context/DataContext.jsx");
  const { default: WriteReview } = await vite.ssrLoadModule("/src/pages/WriteReview.jsx");
  render(h(AuthProvider, {}, h(DataProvider, {}, h(WriteReview, { params: new URLSearchParams() }))));
  const professorInput = await screen.findByRole("combobox", { name: "Professor" });
  assert.equal(screen.getByRole("combobox", { name: "Course" }).disabled, true);
  type(professorInput, "one"); fireEvent.click(screen.getByRole("option", { name: /Professor One/ }));
  let courseInput = screen.getByRole("combobox", { name: "Course" });
  assert.equal(courseInput.disabled, false);
  type(courseInput, "database"); fireEvent.click(screen.getByRole("option", { name: /CS1206/ }));
  assert.match(courseInput.value, /Database/);
  type(professorInput, "two"); fireEvent.click(screen.getByRole("option", { name: /Professor Two/ }));
  courseInput = screen.getByRole("combobox", { name: "Course" });
  assert.equal(courseInput.value, "");
  type(courseInput, "database"); assert.equal(screen.queryByRole("listbox"), null);
  type(courseInput, "calc"); assert.match(screen.getByRole("option", { name: /MA1101/ }).textContent, /Calculus/);
});


test("multi-selection search clears its text after a choice so another professor can be found", () => {
  const choices = [];
  render(h(SearchSelect, { label: "Add a professor", clearOnSelect: true, options: [
    { value: "p-one", label: "Professor One" }, { value: "p-two", label: "Professor Two" },
  ], onChange: value => choices.push(value) }));
  const input = screen.getByRole("combobox", { name: "Add a professor" });
  type(input, "one"); fireEvent.click(screen.getByRole("option", { name: "Professor One" }));
  assert.equal(input.value, "");
  assert.equal(screen.queryByRole("listbox"), null);
  type(input, "two"); fireEvent.keyDown(input, { key: "Enter" });
  assert.deepEqual(choices, ["p-one", "p-two"]);
  assert.equal(input.value, "");
});
