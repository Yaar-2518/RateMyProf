import { randomUUID } from "node:crypto";
import { HttpError, requireValue } from "../lib/errors.js";
import { id, text } from "../lib/validation.js";
import { ratingLabels, reviewTags, gradeOptions, attendanceOptions, textbookOptions, examDifficultyOptions, transparencyOptions } from "../../shared/reviewOptions.js";

export function validateReview(body) {
  const professorId = id(body.professorId),
    courseId = id(body.courseId);
  requireValue(
    typeof body.semester === "string" &&
      /^(Spring|Autumn) 20\d{2}$/.test(body.semester),
    "Choose a valid semester and year.",
  );
  requireValue(
    Number(body.semester.slice(-4)) <= new Date().getFullYear() &&
      !(
        body.semester === `Autumn ${new Date().getFullYear()}` &&
        new Date().getMonth() < 6
      ),
    "Choose a semester that has started.",
  );
  requireValue(
    Array.isArray(body.ratings) &&
      body.ratings.length === ratingLabels.length &&
      body.ratings.every(
        (value) => Number.isInteger(value) && value >= 1 && value <= 5,
      ),
    "Rate all six categories from 1 to 5.",
  );
  requireValue(
    Array.isArray(body.tags) &&
      body.tags.length <= 5 &&
      new Set(body.tags).size === body.tags.length &&
      body.tags.every((tag) => reviewTags.includes(tag)),
    "Choose up to five different tags from the list.",
  );
  requireValue(
    body.confirmed === true,
    "Confirm this review reflects your personal experience.",
  );
  const reviewText = text(body.text ?? "", "Review", 1000, true);
  requireValue(
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(reviewText),
    "Remove unsupported control characters from your review.",
  );

  // Optional context fields
  const grade = body.grade || null;
  if (grade) requireValue(gradeOptions.includes(grade), "Choose a valid grade option.");
  const attendance = body.attendance || null;
  if (attendance) requireValue(attendanceOptions.includes(attendance), "Choose a valid attendance option.");
  const textbook = body.textbook || null;
  if (textbook) requireValue(textbookOptions.includes(textbook), "Choose a valid textbook option.");
  const examDifficulty = body.examDifficulty || null;
  if (examDifficulty) requireValue(examDifficultyOptions.includes(examDifficulty), "Choose a valid exam difficulty option.");
  const transparency = body.transparency || null;
  if (transparency) requireValue(transparencyOptions.includes(transparency), "Choose a valid transparency option.");

  return {
    professorId,
    courseId,
    semester: body.semester,
    ratings: body.ratings,
    tags: body.tags,
    text: reviewText,
    grade,
    attendance,
    textbook,
    examDifficulty,
    transparency,
  };
}

export function createReviewService(db, auth) {
  const reviewsCol = db.collection("reviews");
  const professorsCol = db.collection("professors");
  const departmentsCol = db.collection("departments");
  const linksCol = db.collection("professor_courses");

  async function list() {
    const rows = await reviewsCol.find({ status: "approved" }).sort({ created_at: -1, _id: 1 }).toArray();

    // Build department lookup via professors.
    const profIds = [...new Set(rows.map((r) => r.professor_id))];
    const profs = await professorsCol.find({ _id: { $in: profIds } }).toArray();
    const deptIds = [...new Set(profs.map((p) => p.department_id))];
    const depts = await departmentsCol.find({ _id: { $in: deptIds } }).toArray();
    const deptMap = Object.fromEntries(depts.map((d) => [d._id, d.name]));
    const profDeptMap = Object.fromEntries(
      profs.map((p) => [p._id, deptMap[p.department_id] || ""]),
    );

    // Fetch vote counts for all reviews
    const reviewIds = rows.map((r) => r._id);
    const votesCol = db.collection("votes");
    const voteDocs = reviewIds.length
      ? await votesCol.find({ reviewId: { $in: reviewIds } }).toArray()
      : [];
    const voteMap = {};
    for (const v of voteDocs) {
      if (!voteMap[v.reviewId]) voteMap[v.reviewId] = { up: 0, down: 0 };
      if (v.value === 1) voteMap[v.reviewId].up++;
      else voteMap[v.reviewId].down++;
    }

    return rows.map((row) => {
      const ratings = row.ratings;
      const votes = voteMap[row._id] || { up: 0, down: 0 };
      return {
        id: row._id,
        professorId: row.professor_id,
        courseId: row.course_id,
        semester: row.semester,
        ratings,
        rating: ratings[5],
        text: row.review_text,
        tags: row.tags,
        date: new Date(row.created_at).toISOString().slice(0, 10),
        department: profDeptMap[row.professor_id] || "",
        grade: row.grade || null,
        attendance: row.attendance || null,
        textbook: row.textbook || null,
        examDifficulty: row.exam_difficulty || null,
        transparency: row.transparency || null,
        upvotes: votes.up,
        downvotes: votes.down,
        helpfulness: votes.up - votes.down,
      };
    });
  }

  async function submit(user, body) {
    requireValue(
      user.role === "student",
      "Only student accounts can submit reviews.",
      403,
    );
    const review = validateReview(body),
      reviewId = randomUUID();
    // Verify the teaching assignment exists.
    const link = await linksCol.findOne({
      professorId: review.professorId,
      courseId: review.courseId,
    });
    requireValue(
      link,
      "This professor does not teach the selected course.",
    );
    const key = await auth.reviewIdentity(
      user.id,
      review.professorId,
      review.courseId,
    );
    try {
      await reviewsCol.insertOne({
        _id: reviewId,
        professor_id: review.professorId,
        course_id: review.courseId,
        context_key: key,
        user_id: user.id,
        semester: review.semester,
        ratings: review.ratings,
        review_text: review.text,
        tags: review.tags,
        grade: review.grade,
        attendance: review.attendance,
        textbook: review.textbook,
        exam_difficulty: review.examDifficulty,
        transparency: review.transparency,
        status: "pending",
        created_at: new Date(),
      });
    } catch (error) {
      if (error.code === 11000)
        throw new HttpError(
          409,
          "You have already reviewed this professor for this course.",
          "REVIEW_EXISTS",
        );
      throw error;
    }
    return { id: reviewId, message: "Your anonymous review has been submitted and is pending approval." };
  }
  async function pendingList() {
    const rows = await reviewsCol.find({ status: "pending" }).sort({ created_at: -1 }).toArray();
    const profIds = [...new Set(rows.map((r) => r.professor_id))];
    const profs = await professorsCol.find({ _id: { $in: profIds } }).toArray();
    const deptIds = [...new Set(profs.map((p) => p.department_id))];
    const depts = await departmentsCol.find({ _id: { $in: deptIds } }).toArray();
    const deptMap = Object.fromEntries(depts.map((d) => [d._id, d.name]));
    const profMap = Object.fromEntries(profs.map((p) => [p._id, { name: p.name, dept: deptMap[p.department_id] || "" }]));
    return rows.map((row) => ({
      id: row._id,
      professorId: row.professor_id,
      professorName: profMap[row.professor_id]?.name || "Unknown",
      courseId: row.course_id,
      semester: row.semester,
      ratings: row.ratings,
      rating: row.ratings[5],
      text: row.review_text,
      tags: row.tags,
      date: new Date(row.created_at).toISOString().slice(0, 10),
      department: profMap[row.professor_id]?.dept || "",
      grade: row.grade || null,
      attendance: row.attendance || null,
      textbook: row.textbook || null,
      examDifficulty: row.exam_difficulty || null,
      transparency: row.transparency || null,
      status: row.status,
    }));
  }

  async function setStatus(reviewId, status) {
    requireValue(["approved", "rejected"].includes(status), 'Status must be "approved" or "rejected".');
    const result = await reviewsCol.updateOne(
      { _id: reviewId },
      { $set: { status, reviewed_at: new Date() } },
    );
    requireValue(result.matchedCount > 0, "Review not found.", 404);
  }

  async function vote(userId, reviewId, value) {
    requireValue(value === 1 || value === -1, "Vote must be 1 (up) or -1 (down).");
    const votesCol = db.collection("votes");
    const existing = await votesCol.findOne({ reviewId, userId });
    if (existing) {
      if (existing.value === value) {
        // Toggle off: remove vote
        await votesCol.deleteOne({ _id: existing._id });
        return { action: "removed" };
      }
      // Change vote direction
      await votesCol.updateOne({ _id: existing._id }, { $set: { value } });
      return { action: "changed" };
    }
    await votesCol.insertOne({ _id: randomUUID(), reviewId, userId, value, created_at: new Date() });
    return { action: "added" };
  }

  async function userVotes(userId) {
    const votesCol = db.collection("votes");
    const docs = await votesCol.find({ userId }).toArray();
    return Object.fromEntries(docs.map((d) => [d.reviewId, d.value]));
  }

  async function myReviews(userId) {
    const rows = await reviewsCol.find({ user_id: userId }).sort({ created_at: -1 }).toArray();
    const profIds = [...new Set(rows.map((r) => r.professor_id))];
    const profs = await professorsCol.find({ _id: { $in: profIds } }).toArray();
    const profMap = Object.fromEntries(profs.map((p) => [p._id, p.name]));
    const courseIds = [...new Set(rows.map((r) => r.course_id))];
    const courseDocs = await db.collection("courses").find({ _id: { $in: courseIds } }).toArray();
    const courseMap = Object.fromEntries(courseDocs.map((c) => [c._id, { name: c.name, code: c.code }]));
    return rows.map((row) => ({
      id: row._id,
      professorId: row.professor_id,
      professorName: profMap[row.professor_id] || "Unknown",
      courseId: row.course_id,
      courseName: courseMap[row.course_id]?.name || "Unknown",
      courseCode: courseMap[row.course_id]?.code || "",
      semester: row.semester,
      ratings: row.ratings,
      rating: row.ratings[5],
      text: row.review_text,
      tags: row.tags,
      date: new Date(row.created_at).toISOString().slice(0, 10),
      status: row.status || "approved",
      grade: row.grade || null,
      attendance: row.attendance || null,
      textbook: row.textbook || null,
      examDifficulty: row.exam_difficulty || null,
      transparency: row.transparency || null,
    }));
  }

  return { list, submit, pendingList, setStatus, vote, userVotes, myReviews };
}
