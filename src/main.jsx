import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import { InsightArticle, Page, Signature } from "./App.jsx";
import Admin from "./pages/Admin.jsx";
import { SiteProvider } from "./lib/site.jsx";
import "./styles.css";

function Frame({ preview = false }) {
  return (
    <SiteProvider preview={preview}>
      <Layout>
        <Outlet />
      </Layout>
    </SiteProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<Admin />} />
        <Route element={<Frame preview />}>
          <Route path="/preview" element={<Page slug="home" />} />
          <Route path="/preview/about" element={<Page slug="about" />} />
          <Route path="/preview/our-work" element={<Page slug="our-work" />} />
          <Route path="/preview/growth-model" element={<Page slug="growth-model" />} />
          <Route path="/preview/people" element={<Page slug="people" />} />
          <Route path="/preview/insights" element={<Page slug="insights" />} />
          <Route path="/preview/insights/:slug" element={<InsightArticle />} />
          <Route path="/preview/contact" element={<Page slug="contact" />} />
          <Route path="/preview/privacy" element={<Page slug="privacy" />} />
          <Route path="/preview/cookies" element={<Page slug="cookies" />} />
          <Route path="/preview/:slug" element={<Page />} />
        </Route>
        <Route element={<Frame />}>
          <Route path="/" element={<Page slug="home" />} />
          <Route path="/about" element={<Page slug="about" />} />
          <Route path="/our-work" element={<Page slug="our-work" />} />
          <Route path="/growth-model" element={<Page slug="growth-model" />} />
          <Route path="/people" element={<Page slug="people" />} />
          <Route path="/insights" element={<Page slug="insights" />} />
          <Route path="/insights/:slug" element={<InsightArticle />} />
          <Route path="/contact" element={<Page slug="contact" />} />
          <Route path="/privacy" element={<Page slug="privacy" />} />
          <Route path="/cookies" element={<Page slug="cookies" />} />
          <Route path="/services" element={<Navigate to="/our-work" replace />} />
          <Route path="/team" element={<Navigate to="/people" replace />} />
          <Route path="/email-signature" element={<Signature />} />
          <Route path="/:slug" element={<Page />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
