import { Link, PageHeading } from "../components/UI.jsx";
import Icon from "../components/Icon.jsx";

export default function Information({ type }) {
  if (type === "about")
    return (
      <div className="container page">
        <section className="about-hero">
          <div className="eyebrow">BUILT BY STUDENTS. FOR STUDENTS.</div>
          <h1>
            The best campus guide
            <br />
            is <span className="serif accent">each other.</span>
          </h1>
          <p>
            Every semester starts with questions. What’s the teaching style? How
            demanding is the course? Will I feel comfortable asking for help?
            RateMyProf is a space to share those answers.
          </p>
          <Link className="button primary" to="/professors">
            Find your next professor <Icon name="arrow" size={18} />
          </Link>
        </section>
        <div className="values-grid">
          {[
            [
              "book",
              "Useful, not just a number.",
              "Ratings tell part of the story. Thoughtful reviews give students the context to choose classes that suit the way they learn.",
            ],
            [
              "shield",
              "Your voice. Your privacy.",
              "Student accounts keep names and emails out of public reviews. Institutional identity verification will be added later.",
            ],
            [
              "users",
              "A little kindness goes far.",
              "Honest feedback and respect can coexist. Focus on classroom experiences and leave personal judgments at the door.",
            ],
          ].map(([icon, title, text]) => (
            <section className="panel" key={icon}>
              <span className="icon-tile">
                <Icon name={icon} size={25} />
              </span>
              <h3>{title}</h3>
              <p className="body-copy">{text}</p>
            </section>
          ))}
        </div>
        <section className="about-note panel">
          <div className="eyebrow">ABOUT THIS PROJECT</div>
          <h2>A work in progress, with a clear purpose.</h2>
          <p>
            RateMyProf is an independent student project inspired by campus life
            at NIT Warangal. The React frontend is connected to a Node.js,
            Express, and MongoDB backend for catalog management and account
            registration, login, and anonymous review submission. Faculty and
            departments come from official NITW rosters; courses come from the
            published B.Tech curricula. No sample reviews are added. The project
            is not affiliated with or endorsed by the institution.
          </p>
          <Link className="text-link" to="/guidelines">
            Explore our community principles <Icon name="arrow" size={17} />
          </Link>
        </section>
      </div>
    );
  const privacy = type === "privacy";
  const sections = privacy
    ? [
        [
          "What this project stores",
          "Catalog records, registered accounts, password hashes, password recovery records, and login sessions are stored in MongoDB. Reviews are saved in MongoDB. Helpful votes and reports remain temporary frontend previews and reset on refresh. Passwords are hashed on the server rather than stored as readable text.",
        ],
        [
          "What is public",
          "The intended public review includes course context, semester, ratings, tags, and an optional written experience. Names and student email addresses should never be shown alongside reviews. Avoid writing identifying details in your review text.",
        ],
        [
          "Accounts without public identity",
          "Registration accepts approved student emails (@student.nitw.ac.in) via password or Google OAuth. A private, server-generated identity enforces one anonymous review per account, professor, and course. Account information and private identity fields are not returned by public catalog APIs. This provides a foundation for pseudonymous reviews, not anonymity from the server operator.",
        ],
        [
          "Protecting small groups",
          "When analytics are implemented, statistics for very small groups should be withheld until a minimum review threshold is met. This reduces the risk that a specific student can be identified through course or semester details.",
        ],
        [
          "Your information, your control",
          "Account deletion, review management, and final retention rules are future work. Local development email messages are stored privately under .local/mail; SMTP mode sends codes through the configured provider. The account system is connected to MongoDB, and catalog edits require server-authorized admin access.",
        ],
      ]
    : [
        [
          "Share what you actually experienced",
          "Write about classes you attended and courses you studied. Concrete examples about teaching, feedback, assignments, and course expectations are more helpful than broad judgments.",
        ],
        [
          "Focus on the classroom",
          "Discuss how the course was taught and what helped you learn. Leave appearance, personal life, speculation, and unrelated details out of your review.",
        ],
        [
          "Be constructive and respectful",
          "It is okay to describe a difficult experience. Explain what happened and what could be improved. Harassment, threats, discriminatory language, and personal attacks have no place here.",
        ],
        [
          "Keep everyone’s identity safe",
          "Do not share names of other students, email addresses, phone numbers, student IDs, or private conversations. Avoid including details that identify you or someone else.",
        ],
        [
          "One experience, one review",
          "The intended submission policy allows one review per student, professor, and course. Verified participation is handled by Module 2. Persistent review submission and duplicate enforcement will be implemented in Module 3.",
        ],
        [
          "Help us maintain a thoughtful space",
          "Use the report action if a review contains private information, harassment, spam, or unrelated content. In this preview, reports go to the demo moderation queue. Real moderation will be added in Module 5.",
        ],
      ];
  return (
    <div className="container page narrow">
      <PageHeading
        eyebrow={
          privacy ? "A SPACE YOU CAN TRUST" : "A THOUGHTFUL CAMPUS COMMUNITY"
        }
        title={
          privacy
            ? "Your identity stays yours."
            : "Honest feedback. A little kindness."
        }
        description={
          privacy
            ? "How account privacy works, and what remains for the review modules."
            : "A few principles for sharing perspectives that genuinely help."
        }
      />
      <div className="information-sections">
        {sections.map(([title, text], i) => (
          <section key={title}>
            <span className="step-number">0{i + 1}</span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </section>
        ))}
      </div>
      <div className="information-footer">
        <Icon name="shield" size={24} />
        <p>
          {privacy
            ? "Public anonymity requires care in both review data and written content. Persistent review handling is planned for Module 3."
            : "Thank you for helping make this community useful, respectful, and safe."}
        </p>
        <Link
          className="button secondary"
          to={privacy ? "/about" : "/write-review"}
        >
          {privacy ? "About the project" : "Share your perspective"}
          <Icon name="arrow" size={17} />
        </Link>
      </div>
    </div>
  );
}
