import { useState } from "react";
import {
  Avatar,
  Link,
  PageHeading,
  Tabs,
  EmptyState,
} from "../components/UI.jsx";
import Icon from "../components/Icon.jsx";
import ReviewCard from "../components/ReviewCard.jsx";
import { useData } from "../context/DataContext.jsx";
import NotFound from "./NotFound.jsx";

function ReviewList({ reviews }) {
  const [sort, setSort] = useState("recent");
  if (!reviews.length)
    return (
      <EmptyState
        title="No reviews yet"
        description="There are no reviews for this profile yet."
      />
    );
  const sorted = [...reviews].sort((a, b) =>
    sort === "highest" ? b.rating - a.rating : b.date.localeCompare(a.date),
  );
  return (
    <>
      <label className="sort-label">
        Sort by
        <select
          aria-label="Sort reviews"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="recent">Most recent</option>
          <option value="highest">Highest rating</option>
        </select>
      </label>
      <div className="review-list">
        {sorted.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>
    </>
  );
}

export default function Profile({ id, type, reviewsOnly = false }) {
  const { professors, courses, reviews } = useData();
  const isCourse = type === "courses";
  const item = (isCourse ? courses : professors).find(
    (record) => record.id === id,
  );
  const [tab, setTab] = useState("Overview");
  if (!item) return <NotFound />;
  const itemReviews = reviews.filter(
    (review) => (isCourse ? review.courseId : review.professorId) === id,
  );
  const related = isCourse
    ? professors.filter((professor) => professor.courses.includes(id))
    : courses.filter((course) => item.courses.includes(course.id));
  const writeLink = `/write-review?${isCourse ? "course" : "professor"}=${id}`;
  if (reviewsOnly)
    return (
      <div className="container page narrow">
        <Link className="back-link" to={`/${type}/${id}`}>
          <Icon name="back" size={16} />
          Back to {item.name}
        </Link>
        <PageHeading
          eyebrow="STUDENT PERSPECTIVES"
          title="Reviews"
          description={`Reviews for ${item.name}.`}
        />
        <ReviewList reviews={itemReviews} />
      </div>
    );
  return (
    <div className="container page">
      <Link className="back-link" to={`/${type}`}>
        <Icon name="back" size={16} />
        Back to {isCourse ? "courses" : "professors"}
      </Link>
      <section className="profile-header">
        {isCourse ? (
          <span className="course-icon large">
            <Icon name="book" size={35} />
          </span>
        ) : (
          <Avatar professor={item} size="large-avatar" />
        )}
        <div className="profile-info">
          <div className="eyebrow">
            {isCourse
              ? `${item.code} · ${item.credits === null ? "CREDITS NOT SPECIFIED" : `${item.credits} CREDITS`}`
              : item.designation}
          </div>
          <h1>{item.name}</h1>
          <p>
            {item.department}
            {isCourse ? ` · ${item.semester}` : ""}
          </p>
          {!isCourse && (
            <span className="profile-location">
              <Icon name="pin" size={14} />
              {item.office}
            </span>
          )}
        </div>
        <div className="rating-summary">
          <strong>
            {itemReviews.length ? item.rating.toFixed(1) + " / 5" : "Not rated"}
          </strong>
          <span className="muted small">
            {itemReviews.length
              ? `${itemReviews.length} review${itemReviews.length === 1 ? "" : "s"}`
              : "No reviews yet"}
          </span>
        </div>
        <Link to={writeLink} className="button primary">
          <Icon name="edit" size={17} />
          Write a review
        </Link>
      </section>
      <Tabs
        tabs={["Overview", "Reviews", isCourse ? "Professors" : "Courses"]}
        value={tab}
        onChange={setTab}
      />
      <div className="tab-content" role="tabpanel" aria-label={tab}>
        {tab === "Overview" && (
          <>
            <div className="profile-grid secondary-grid">
              <section className="panel">
                <h3>About {isCourse ? "the course" : "the professor"}</h3>
                <p className="body-copy">
                  {isCourse ? item.description : item.bio}
                </p>
                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    Official NITW source <Icon name="arrow" size={15} />
                  </a>
                )}
              </section>
              <section className="panel">
                <h3>
                  {isCourse
                    ? "Professors teaching this course"
                    : "Courses taught"}
                </h3>
                <RelatedList items={related} isCourse={isCourse} />
              </section>
            </div>
            <div className="section-heading reviews-heading">
              <h2>Reviews</h2>
              <Link className="text-link" to={`/${type}/${id}/reviews`}>
                See all reviews <Icon name="arrow" size={17} />
              </Link>
            </div>
            <ReviewList reviews={itemReviews} />
          </>
        )}
        {tab === "Reviews" && <ReviewList reviews={itemReviews} />}
        {tab === (isCourse ? "Professors" : "Courses") && (
          <section className="panel">
            <h3>
              {isCourse ? "Professors teaching this course" : "Courses taught"}
            </h3>
            <RelatedList items={related} isCourse={isCourse} />
          </section>
        )}
      </div>
    </div>
  );
}
function RelatedList({ items, isCourse }) {
  return (
    <div className="related-list">
      {items.length ? (
        items.map((item) => (
          <Link
            to={`/${isCourse ? "professors" : "courses"}/${item.id}`}
            className="related-item"
            key={item.id}
          >
            {isCourse ? (
              <Avatar professor={item} size="small-avatar" />
            ) : (
              <span className="course-icon small-icon">
                <Icon name="book" size={17} />
              </span>
            )}
            <div>
              <strong>{item.name}</strong>
              <span>
                {isCourse
                  ? item.department
                  : `${item.code} · ${item.credits === null ? "Credits not specified" : `${item.credits} credits`}`}
              </span>
            </div>
            <Icon name="chevron" size={17} />
          </Link>
        ))
      ) : (
        <p className="muted">No teaching assignments added yet.</p>
      )}
    </div>
  );
}
