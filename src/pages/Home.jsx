import { useState } from "react";
import { Link } from "../components/UI.jsx";
import Icon from "../components/Icon.jsx";

export default function Home() {
  const [query, setQuery] = useState("");
  function search(e) {
    e.preventDefault();
    window.location.hash = `/professors?q=${encodeURIComponent(query.trim())}`;
  }
  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="status-dot" /> YOUR CAMPUS. YOUR PERSPECTIVE.
          </div>
          <h1>
            Great classes start
            <br />
            with a little <span className="serif accent">insight.</span>
          </h1>
          <p className="hero-description">
            Find your next professor. Know what to expect.
            <br className="desktop-break" /> Share what you wish you’d known —
            anonymously.
          </p>
          <form className="hero-search" onSubmit={search}>
            <Icon name="search" size={22} />
            <input
              aria-label="Search for a professor, course, or department"
              placeholder="Professor, course, or department..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="button primary" type="submit">
              Find your fit <Icon name="arrow" size={18} />
            </button>
          </form>
          <div className="popular-searches">
            <span>Popular:</span>
            {[
              "Computer Science and Engineering",
              "Mathematics",
              "Electrical Engineering",
            ].map((d) => (
              <Link
                key={d}
                to={`/professors?department=${encodeURIComponent(d)}`}
              >
                {d} <span>↗</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="hero-art">
          <img
            src="/nitw-campus.png"
            alt="National Institute of Technology Warangal main building"
          />
        </div>
      </section>
      <section className="contribution-banner container">
        <div>
          <div className="eyebrow">YOUR EXPERIENCE CAN MAKE A DIFFERENCE</div>
          <h2>A good semester starts with you.</h2>
          <p>Got a perspective to share? Give the next student a head start.</p>
        </div>
        <Link className="button primary" to="/write-review">
          Write an anonymous review <Icon name="arrow" size={19} />
        </Link>
        <span className="banner-doodle" aria-hidden="true">
          ✳
        </span>
      </section>
    </>
  );
}
