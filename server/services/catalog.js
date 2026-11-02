import { randomUUID } from "node:crypto";
import { HttpError, requireValue } from "../lib/errors.js";
import { text, id, code } from "../lib/validation.js";

export function createCatalogService(db) {
  const departmentsCol = db.collection("departments");
  const professorsCol = db.collection("professors");
  const coursesCol = db.collection("courses");
  const linksCol = db.collection("professor_courses");

  async function departments() {
    return departmentsCol.find({}, { projection: { _id: 0, id: "$_id", name: 1, code: 1 } }).sort({ name: 1 }).toArray();
  }

  async function list(kind, filters = {}) {
    const professor = kind === "professors";
    const col = professor ? professorsCol : coursesCol;
    const query = {};

    if (filters.department) {
      const deptName = text(filters.department, "Department", 100);
      const dept = await departmentsCol.findOne({ name: deptName });
      if (dept) query.department_id = dept._id;
      else query.department_id = "__none__";
    }

    if (filters.q) {
      const q = text(filters.q, "Search", 120).toLowerCase();
      if (professor) {
        // Search professor name, department name, or associated course name/code.
        const depts = await departmentsCol.find({ name: { $regex: q, $options: "i" } }).toArray();
        const deptIds = depts.map((d) => d._id);
        const matchingCourses = await coursesCol
          .find({
            $or: [
              { name: { $regex: q, $options: "i" } },
              { code: { $regex: q, $options: "i" } },
            ],
          })
          .toArray();
        const courseIds = matchingCourses.map((c) => c._id);
        const profLinks = courseIds.length
          ? await linksCol.find({ courseId: { $in: courseIds } }).toArray()
          : [];
        const profIdsFromCourses = profLinks.map((l) => l.professorId);
        query.$or = [
          { name: { $regex: q, $options: "i" } },
          { department_id: { $in: deptIds } },
          { _id: { $in: profIdsFromCourses } },
        ];
      } else {
        const depts = await departmentsCol.find({ name: { $regex: q, $options: "i" } }).toArray();
        const deptIds = depts.map((d) => d._id);
        query.$or = [
          { name: { $regex: q, $options: "i" } },
          { code: { $regex: q, $options: "i" } },
          { department_id: { $in: deptIds } },
        ];
      }
    }

    if (filters.course && professor) {
      const courseId = id(filters.course);
      const profLinks = await linksCol.find({ courseId }).toArray();
      const profIds = profLinks.map((l) => l.professorId);
      query._id = { $in: profIds };
    }

    const rows = await col.find(query).sort({ name: 1 }).toArray();

    // Build department lookup.
    const allDeptIds = [...new Set(rows.map((r) => r.department_id))];
    const deptDocs = await departmentsCol.find({ _id: { $in: allDeptIds } }).toArray();
    const deptMap = Object.fromEntries(deptDocs.map((d) => [d._id, d.name]));

    let allLinks = [];
    if (professor) {
      allLinks = await linksCol.find({}).sort({ courseId: 1 }).toArray();
    }

    return rows.map((row) => {
      const common = {
        id: row._id,
        name: row.name,
        department: deptMap[row.department_id] || "",
        departmentId: row.department_id,
        sourceUrl: row.source_url || "",
      };
      if (professor)
        return {
          ...common,
          designation: row.designation,
          office: row.office || "",
          bio: row.bio || "",
          courses: allLinks
            .filter((link) => link.professorId === row._id)
            .map((link) => link.courseId),
          initials: row.name
            .replace(/^(Professor|Prof|Dr)\.?\s*/i, "")
            .split(" ")
            .filter(Boolean)
            .map((n) => n[0])
            .slice(0, 2)
            .join("")
            .toUpperCase(),
        };
      return {
        ...common,
        code: row.code,
        credits: row.credits === null || row.credits === undefined ? null : Number(row.credits),
        semester: row.semester,
        description: row.description || "",
      };
    });
  }

  async function find(kind, identifier) {
    id(identifier);
    const items = await list(kind);
    const item = items.find((record) => record.id === identifier);
    if (!item)
      throw new HttpError(404, "Catalog record not found.", "NOT_FOUND");
    return item;
  }

  async function departmentId(name) {
    const dept = await departmentsCol.findOne({
      name: text(name, "Department", 100),
    });
    requireValue(dept, "Choose an existing department.");
    return dept._id;
  }

  async function save(kind, identifier, body) {
    requireValue(
      body && typeof body === "object" && !Array.isArray(body),
      "Submit a catalog object.",
    );
    const editing = Boolean(identifier);
    const recordId = identifier ? id(identifier) : randomUUID();
    const name = text(body.name, "Name", 100);
    const col = kind === "professors" ? professorsCol : coursesCol;

    if (editing) {
      const exists = await col.findOne({ _id: recordId });
      requireValue(exists, "Catalog record not found.", 404);
    }

    const department = await departmentId(body.department);

    if (kind === "professors") {
      const designation = text(body.designation, "Designation", 120);
      requireValue(
        Array.isArray(body.courses) && body.courses.length <= 100,
        "Courses must be a list of at most 100 course IDs.",
      );
      const courseIds = [...new Set(body.courses.map(id))];
      for (const courseId of courseIds) {
        const course = await coursesCol.findOne({ _id: courseId });
        requireValue(course, "One of the selected courses no longer exists.");
      }
      const doc = {
        name,
        department_id: department,
        designation,
        office: text(body.office || "", "Office", 100, true),
        bio: text(body.bio || "", "Biography", 1000, true),
      };
      if (editing) {
        await col.updateOne({ _id: recordId }, { $set: doc });
      } else {
        await col.insertOne({ _id: recordId, ...doc, source_url: "", created_at: new Date() });
      }
      // Replace professor-course links.
      await linksCol.deleteMany({ professorId: recordId });
      if (courseIds.length) {
        await linksCol.insertMany(
          courseIds.map((courseId) => ({ professorId: recordId, courseId })),
        );
      }
    } else {
      requireValue(
        body.credits === null ||
          (Number.isFinite(body.credits) &&
            Number.isInteger(body.credits * 2) &&
            body.credits >= 0 &&
            body.credits <= 10),
        "Credits must be unknown or from 0 to 10 in half-credit increments.",
      );
      requireValue(
        body.semester === "Not specified" ||
          /^Semester [1-8]( or [1-8])?$/.test(body.semester),
        "Choose a semester from 1 to 8.",
      );
      const doc = {
        code: code(body.code),
        name,
        department_id: department,
        credits: body.credits,
        semester: body.semester,
        description: text(body.description || "", "Description", 1000, true),
      };
      if (editing) {
        await col.updateOne({ _id: recordId }, { $set: doc });
      } else {
        await col.insertOne({ _id: recordId, ...doc, source_url: "", created_at: new Date() });
      }
    }
    return find(kind, recordId);
  }

  async function remove(kind, identifier) {
    id(identifier);
    const col = kind === "professors" ? professorsCol : coursesCol;
    // Check for referencing reviews before deleting.
    const field = kind === "professors" ? "professor_id" : "course_id";
    const refCount = await db.collection("reviews").countDocuments({ [field]: identifier });
    requireValue(
      refCount === 0,
      "This record is still referenced by reviews. Remove its dependencies before deleting it.",
      409,
    );
    await linksCol.deleteMany(kind === "professors" ? { professorId: identifier } : { courseId: identifier });
    const result = await col.deleteOne({ _id: identifier });
    requireValue(result.deletedCount > 0, "Catalog record not found.", 404);
  }

  async function saveDepartment(identifier, body) {
    const values = { name: text(body.name, "Department name", 100), code: code(body.code) };
    const recordId = identifier ? id(identifier) : randomUUID();
    if (identifier) {
      const result = await departmentsCol.updateOne(
        { _id: recordId },
        { $set: values },
      );
      requireValue(result.matchedCount > 0, "Department not found.", 404);
    } else {
      await departmentsCol.insertOne({ _id: recordId, ...values, source_url: "" });
    }
    return { id: recordId, name: values.name, code: values.code };
  }

  async function removeDepartment(identifier) {
    const deptId = id(identifier);
    // Check for referencing professors/courses.
    const profCount = await professorsCol.countDocuments({ department_id: deptId });
    const courseCount = await coursesCol.countDocuments({ department_id: deptId });
    requireValue(
      profCount === 0 && courseCount === 0,
      "This record is still referenced by catalog entries or reviews. Remove its dependencies before deleting it.",
      409,
    );
    const result = await departmentsCol.deleteOne({ _id: deptId });
    requireValue(result.deletedCount > 0, "Department not found.", 404);
  }

  async function snapshot() {
    const departmentRows = await departmentsCol
      .find({}, { projection: { _id: 0, id: "$_id", name: 1, code: 1 } })
      .sort({ name: 1 })
      .toArray();
    return {
      departments: departmentRows,
      professors: await list("professors"),
      courses: await list("courses"),
    };
  }

  return {
    departments,
    list,
    find,
    save,
    remove,
    saveDepartment,
    removeDepartment,
    snapshot,
  };
}
