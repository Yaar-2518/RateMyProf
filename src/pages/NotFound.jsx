import { Link } from "../components/UI.jsx";
import Icon from "../components/Icon.jsx";
export default function NotFound() {
  return (
    <div className="container page not-found">
      <span className="serif accent">404</span>
      <h1>A little off course.</h1>
      <p>
        This page or profile isn’t in our directory. Let’s get you back on
        track.
      </p>
      <Link to="/" className="button primary">
        Back to home <Icon name="arrow" size={18} />
      </Link>
    </div>
  );
}
