import { useEffect, useState } from "react";
import { AuthProvider } from "./context/AuthContext.jsx";
import { AccessGate, CatalogGate } from "./components/AccessGate.jsx";
import { DataProvider } from "./context/DataContext.jsx";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Directory from "./pages/Directory.jsx";
import Profile from "./pages/Profile.jsx";
import WriteReview from "./pages/WriteReview.jsx";
import Auth from "./pages/Auth.jsx";
import Insights from "./pages/Insights.jsx";
import Information from "./pages/Information.jsx";
import Admin from "./pages/Admin.jsx";
import NotFound from "./pages/NotFound.jsx";

// A small hash router: navigation works on a simple static host without
// server rewrites or another library. Example: /#/courses/cs1206
function readRoute() {
  return window.location.hash.slice(1) || "/";
}
export default function App() {
  const [location, setLocation] = useState(readRoute);
  useEffect(() => {
    const onNavigate = () => {
      setLocation(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onNavigate);
    return () => window.removeEventListener("hashchange", onNavigate);
  }, []);
  const [path, query = ""] = location.split("?");
  const params = new URLSearchParams(query);
  const segments = path.split("/").filter(Boolean);
  useEffect(() => {
    const titles = {
      professors: "Professors",
      courses: "Courses",
      "write-review": "Write a review",
      login: "Log in",
      register: "Join the community",
      "forgot-password": "Password recovery",
      "reset-password": "Reset password",
      insights: "Campus insights",
      about: "Our story",
      privacy: "Privacy",
      guidelines: "Community guidelines",
      admin: "Administration",
    };
    document.title = `${titles[segments[0]] || "A little insight goes a long way."} — RateMyProf`;
  }, [path]);
  let page;
  if (path === "/") page = <Home />;
  else if (
    ["professors", "courses"].includes(segments[0]) &&
    segments.length === 1
  )
    page = <Directory type={segments[0]} params={params} />;
  else if (
    ["professors", "courses"].includes(segments[0]) &&
    (segments.length === 2 ||
      (segments.length === 3 && segments[2] === "reviews"))
  )
    page = (
      <Profile
        type={segments[0]}
        id={segments[1]}
        reviewsOnly={segments[2] === "reviews"}
      />
    );
  else if (path === "/write-review") page = <WriteReview params={params} />;
  else if (
    ["/login", "/register", "/forgot-password", "/reset-password"].includes(
      path,
    )
  )
    page = <Auth mode={segments[0]} params={params} />;
  else if (path === "/insights") page = <Insights />;
  else if (["/about", "/privacy", "/guidelines"].includes(path))
    page = <Information type={segments[0]} />;
  else if (
    path === "/admin" ||
    [
      "/admin/professors",
      "/admin/courses",
      "/admin/departments",
      "/admin/moderation",
    ].includes(path)
  )
    page = <Admin section={segments[1]} />;
  else page = <NotFound />;
  if (path.startsWith("/admin"))
    page = (
      <AccessGate admin returnTo={path}>
        {page}
      </AccessGate>
    );
  if (path === "/write-review")
    page = <AccessGate returnTo={location}>{page}</AccessGate>;
  const catalogRequired = [
    "professors",
    "courses",
    "admin",
    "write-review",
  ].includes(segments[0]);
  if (catalogRequired) page = <CatalogGate>{page}</CatalogGate>;
  // Route keys reset page-local form/filter state when visiting another page.
  return (
    <AuthProvider>
      <DataProvider>
        <Layout route={path}>
          <div key={location}>{page}</div>
        </Layout>
      </DataProvider>
    </AuthProvider>
  );
}
