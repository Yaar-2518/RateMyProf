import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig, projectRoot } from "../config.js";
import { connectDb } from "../db.js";
import { migrate } from "./migrate.js";

export async function importNitwCatalog(
  db,
  catalog,
  { overwrite = true } = {},
) {
  const expected = new Set(
    catalog.departments.map((department) => department.id),
  );
  if (
    !catalog.professors.length ||
    !catalog.courses.length ||
    catalog.professors.some((p) => !expected.has(p.departmentId)) ||
    catalog.courses.some((c) => !expected.has(c.departmentId))
  )
    throw new Error("Incomplete official catalog; import aborted.");

  const departmentsCol = db.collection("departments");
  const coursesCol = db.collection("courses");
  const professorsCol = db.collection("professors");
  const linksCol = db.collection("professor_courses");

  const departmentIds = new Map();
  const courseIds = new Map();

  for (const department of catalog.departments) {
    const existing = await departmentsCol.findOne({ code: department.code });
    const identifier = existing?._id || department.id;
    departmentIds.set(department.id, identifier);

    if (existing) {
      if (overwrite) {
        await departmentsCol.updateOne(
          { _id: identifier },
          {
            $set: {
              name: department.name,
              source_url: department.sourceUrl,
            },
          },
        );
      }
    } else {
      await departmentsCol.insertOne({
        _id: identifier,
        name: department.name,
        code: department.code,
        source_url: department.sourceUrl,
      });
    }
  }

  const existingCourses = await coursesCol.find({}).toArray();
  const existingIds = new Map(existingCourses.map((c) => [c.code, c._id]));

  for (const course of catalog.courses) {
    const identifier = existingIds.get(course.code) || course.id;
    courseIds.set(course.id, identifier);

    const doc = {
      code: course.code,
      name: course.name,
      department_id: departmentIds.get(course.departmentId),
      credits: course.credits,
      semester: course.semester,
      description: `Published in the NIT Warangal B.Tech curriculum, page ${course.sourcePage}.`,
      source_url: course.sourceUrl,
    };

    const existing = await coursesCol.findOne({ _id: identifier });
    if (existing) {
      if (overwrite) {
        await coursesCol.updateOne({ _id: identifier }, { $set: doc });
      }
    } else {
      await coursesCol.insertOne({ _id: identifier, ...doc });
    }
  }

  for (const professor of catalog.professors) {
    const doc = {
      name: professor.name,
      department_id: departmentIds.get(professor.departmentId),
      designation: professor.designation,
      office: "",
      bio: "Faculty listed on the official NIT Warangal department roster.",
      source_url: professor.sourceUrl.startsWith("https://erp.nitw.ac.in/")
        ? professor.sourceUrl
        : professor.rosterUrl,
    };

    const existing = await professorsCol.findOne({ _id: professor.id });
    if (existing) {
      if (overwrite) {
        await professorsCol.updateOne({ _id: professor.id }, { $set: doc });
      }
    } else {
      await professorsCol.insertOne({ _id: professor.id, ...doc });
    }
  }

  for (const assignment of catalog.assignments) {
    if (
      !courseIds.has(assignment.courseId) ||
      !catalog.professors.some((p) => p.id === assignment.professorId)
    )
      throw new Error("Invalid teaching assignment; import rolled back.");

    const link = {
      professorId: assignment.professorId,
      courseId: courseIds.get(assignment.courseId),
    };
    await linksCol.updateOne(
      link,
      { $setOnInsert: link },
      { upsert: true },
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let client;
  try {
    const config = readConfig();
    const { client: mongoClient, db } = await connectDb(config);
    client = mongoClient;

    const catalog = JSON.parse(
      await fs.readFile(
        path.join(projectRoot, "shared/nitwCatalog.json"),
        "utf8",
      ),
    );

    await migrate(db);
    await importNitwCatalog(db, catalog);
    console.log(
      `Imported ${catalog.departments.length} departments, ${catalog.professors.length} professors, ${catalog.courses.length} courses, ${catalog.assignments.length} verified teaching links. Existing accounts, reviews, and manual records are preserved.`,
    );
  } catch (error) {
    console.error("NITW import failed:", error.code || error.message);
    process.exitCode = 1;
  } finally {
    if (client) await client.close();
  }
}
