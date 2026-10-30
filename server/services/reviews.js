import { randomUUID } from "node:crypto";
import { HttpError, requireValue } from "../lib/errors.js";
import { id, text } from "../lib/validation.js";
import { ratingLabels, reviewTags } from "../../shared/reviewOptions.js";

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
  return {
    professorId,
    courseId,
    semester: body.semester,
    ratings: body.ratings,
    tags: body.tags,
    text: reviewText,
  };
}

export function createReviewService(db, auth) {
  const reviewsCol = db.collection("reviews");
  const professorsCol = db.collection("professors");
  const departmentsCol = db.collection("departments");
  const linksCol = db.collection("professor_courses");

  async function list() {
    const rows = await reviewsCol.find({}).sort({ created_at: -1, _id: 1 }).toArray();

    // Build department lookup via professors.
    const profIds = [...new Set(rows.map((r) => r.professor_id))];
    const profs = await professorsCol.find({ _id: { $in: profIds } }).toArray();
    const deptIds = [...new Set(profs.map((p) => p.department_id))];
    const depts = await departmentsCol.find({ _id: { $in: deptIds } }).toArray();
    const deptMap = Object.fromEntries(depts.map((d) => [d._id, d.name]));
    const profDeptMap = Object.fromEntries(
      profs.map((p) => [p._id, deptMap[p.department_id] || ""]),
    );

    return rows.map((row) => {
      const ratings = row.ratings;
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
        semester: review.semester,
        ratings: review.ratings,
        review_text: review.text,
        tags: review.tags,
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
    return { id: reviewId, message: "Your anonymous review has been saved." };
  }
  return { list, submit };
}
