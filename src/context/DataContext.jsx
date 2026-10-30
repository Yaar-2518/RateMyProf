import { createContext, useContext, useEffect, useState } from "react";
import { request } from "../services/api.js";
const DataContext = createContext(null);
function withReviewSummary(records, reviews, field) {
  return records.map((record) => {
    const matches = reviews.filter((review) => review[field] === record.id);
    return {
      ...record,
      reviewCount: matches.length,
      rating: matches.length
        ? matches.reduce((sum, review) => sum + review.rating, 0) /
          matches.length
        : null,
    };
  });
}
export function DataProvider({ children }) {
  const [professors, setProfessors] = useState([]),
    [courses, setCourses] = useState([]),
    [departmentRecords, setDepartmentRecords] = useState([]);
  const [reviews, setReviews] = useState([]),
    [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");

  async function refreshCatalog({ showLoading = false } = {}) {
    if (showLoading) setLoading(true);
    try {
      const [data, reviewData] = await Promise.all([
        request("/catalog"),
        request("/reviews"),
      ]);
      setProfessors(data.professors);
      setCourses(data.courses);
      setDepartmentRecords(data.departments);
      setError("");
      setReviews(reviewData.reviews);
    } catch (failure) {
      setError(failure.message);
      throw failure;
    } finally {
      setLoading(false);
    }
  }

  async function refreshReports() {
    try {
      const data = await request("/reports");
      setReports(data.reports);
    } catch {
      // Non-admins will get 403 — that's fine, just leave reports empty
    }
  }

  useEffect(() => {
    refreshCatalog().catch(() => {});
  }, []);

  async function saveCatalog(kind, itemId, body) {
    await request(`/${kind}${itemId ? `/${itemId}` : ""}`, {
      method: itemId ? "PUT" : "POST",
      body,
    });
    await refreshCatalog();
  }
  async function deleteCatalog(kind, itemId) {
    await request(`/${kind}/${itemId}`, { method: "DELETE" });
    await refreshCatalog();
  }

  // Report a review (returns the new report id)
  async function reportReview(reviewId, reason, details) {
    const result = await request(`/reviews/${reviewId}/report`, {
      method: "POST",
      body: { reason, details },
    });
    // Optimistically add to local reports so UI reacts immediately
    setReports((prev) => [
      ...prev,
      {
        id: result.id,
        reviewId,
        reason,
        details,
        status: "Pending",
        date: new Date().toISOString().slice(0, 10),
      },
    ]);
    return result;
  }

  // Admin: resolve a report (dismiss or remove)
  async function resolveReport(reportId, action) {
    await request(`/reports/${reportId}`, {
      method: "PATCH",
      body: { action },
    });
    const newStatus = action === "remove" ? "Removed" : "Dismissed";
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, status: newStatus } : r)),
    );
    if (action === "remove") {
      // Remove the deleted review from local state
      const report = reports.find((r) => r.id === reportId);
      if (report) {
        setReviews((prev) => prev.filter((r) => r.id !== report.reviewId));
      }
    }
  }

  // Admin: delete a review directly
  async function deleteReview(reviewId) {
    await request(`/reviews/${reviewId}`, { method: "DELETE" });
    setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    setReports((prev) =>
      prev.map((r) =>
        r.reviewId === reviewId && r.status === "Pending"
          ? { ...r, status: "Removed" }
          : r,
      ),
    );
  }

  return (
    <DataContext.Provider
      value={{
        professors: withReviewSummary(professors, reviews, "professorId"),
        courses: withReviewSummary(courses, reviews, "courseId"),
        departmentRecords,
        departments: departmentRecords.map((d) => d.name),
        reviews,
        reports,
        setReports,
        loading,
        error,
        refreshCatalog,
        refreshReports,
        saveCatalog,
        deleteCatalog,
        reportReview,
        resolveReport,
        deleteReview,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}
export function useData() {
  return useContext(DataContext);
}
