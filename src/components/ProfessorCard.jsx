import { Avatar, Link } from "./UI.jsx";
import Icon from "./Icon.jsx";

export default function ProfessorCard({ professor }) {
  const count = professor.reviewCount;
  return (
    <article className="professor-card">
      <div className="card-person">
        <Avatar professor={professor} />
        <div>
          <Link to={`/professors/${professor.id}`} className="person-name">
            {professor.name}
          </Link>
          <p>{professor.department}</p>
        </div>
      </div>
      <div className="card-bottom">
        <span>
          {count
            ? `${count} review${count === 1 ? "" : "s"}`
            : "No reviews yet"}
        </span>
        <Link to={`/professors/${professor.id}`} className="text-link">
          View profile <Icon name="arrow" size={16} />
        </Link>
      </div>
    </article>
  );
}
