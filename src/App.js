import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";

// ---------------- Environment Variables ----------------
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function App() {
  // ---------------- States ----------------
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPrincipal, setIsPrincipal] = useState(false);
  const [department, setDepartment] = useState("");

  const [suggestions, setSuggestions] = useState([]);
  const [viewSuggestion, setViewSuggestion] = useState(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [loading, setLoading] = useState(false);

  const [notification, setNotification] = useState(null);
  const googleButtonRef = useRef(null);

  // ---------------- Notification ----------------
  const showNotification = (msg, type = "success") => {
    setNotification({ message: msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // ---------------- Google Login ----------------
  const handleCredentialResponse = useCallback(async (response) => {
    if (!response?.credential) return showNotification("No credential returned", "error");

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: response.credential }),
      });
      const result = await res.json();

      if (res.ok) {
        setEmail(result.email);
        setIsAdmin(result.isAdmin || false);
        setIsPrincipal(result.isPrincipal || false);
        setDepartment(result.department || "");
        setLoggedIn(true);
        showNotification("Logged in successfully!");
      } else {
        showNotification(result.error || "Login failed", "error");
      }
    } catch (err) {
      console.error("Login error:", err);
      showNotification("Login error. Check console.", "error");
    }
  }, []);

  // ---------------- Load Google Script ----------------
  useEffect(() => {
    if (loggedIn) return;
    if (googleButtonRef.current) googleButtonRef.current.innerHTML = "";

    const loadGoogleScript = () =>
      new Promise((resolve) => {
        if (window.google) return resolve();
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        document.head.appendChild(script);
      });

    loadGoogleScript().then(() => {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "filled_blue",
        size: "large",
        type: "standard",
        text: "signin_with",
      });
    });
  }, [loggedIn, handleCredentialResponse]);

  // ---------------- Load Suggestions ----------------
  const loadSuggestions = useCallback(async () => {
    if (!email) return;

    try {
      const url = isAdmin
        ? `${API_BASE_URL}/api/admin/suggestions?email=${encodeURIComponent(email)}`
        : `${API_BASE_URL}/api/student/suggestions?email=${encodeURIComponent(email)}`;
      const res = await fetch(url);

      if (!res.ok) {
        const err = await res.json();
        console.error("Load suggestions error:", err);
        setSuggestions([]);
        showNotification("Failed to load suggestions", "error");
        return;
      }
      const data = await res.json();
      setSuggestions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Load suggestions error:", err);
      setSuggestions([]);
      showNotification("Failed to load suggestions. Check console.", "error");
    }
  }, [isAdmin, email]);

  useEffect(() => {
    if (loggedIn) loadSuggestions();
  }, [loggedIn, loadSuggestions]);

  // ---------------- Refresh ----------------
  const handleRefresh = async () => {
    setLoading(true);
    await loadSuggestions();
    setLoading(false);
    showNotification("Suggestions refreshed", "info");
  };

  // ---------------- Delete Suggestion ----------------
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this suggestion?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/student/suggestions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        showNotification(err.error || "Delete failed", "error");
        return;
      }
      setSuggestions((prev) => prev.filter((s) => s._id !== id));
      if (viewSuggestion && viewSuggestion._id === id) setViewSuggestion(null);
      showNotification("Suggestion deleted successfully!");
    } catch (err) {
      console.error("Delete error:", err);
      showNotification("Delete failed. Check console.", "error");
    }
  };

  // ---------------- Status Update ----------------
  const handleStatusChange = async (id, status) => {
    try {
      const updatedBy = isPrincipal ? "Principal" : "HOD";
      const res = await fetch(`${API_BASE_URL}/api/admin/suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, updatedBy }),
      });
      const updated = await res.json();

      if (res.ok) {
        setSuggestions((prev) => prev.map((s) => (s._id === id ? updated : s)));
        if (viewSuggestion && viewSuggestion._id === id) setViewSuggestion(updated);
        showNotification(`Status updated to "${status}"`);
      } else {
        showNotification(updated.error || "Status update failed", "error");
      }
    } catch (err) {
      console.error("Status update error:", err);
      showNotification("Status update failed. Check console.", "error");
    }
  };

  // ---------------- View Suggestion ----------------
  const handleView = async (id) => {
    try {
      const url = isAdmin
        ? `${API_BASE_URL}/api/admin/suggestions/view/${id}`
        : `${API_BASE_URL}/api/student/suggestions/view/${id}?email=${encodeURIComponent(email)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        showNotification(data?.error || "Failed to load suggestion details", "error");
        return;
      }
      setViewSuggestion(data);
    } catch (err) {
      console.error("View suggestion error:", err);
      showNotification("Failed to load suggestion details. Check console.", "error");
    }
  };
  const closeView = () => setViewSuggestion(null);

  // ---------------- Filter & Sort ----------------
  const filteredSuggestions = suggestions
    .filter((s) => (statusFilter === "all" ? true : s.status === statusFilter))
    .filter((s) => (categoryFilter === "all" ? true : s.category === categoryFilter))
    .filter((s) =>
      (s.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.description || "").toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) =>
      sortOrder === "newest"
        ? new Date(b.createdAt) - new Date(a.createdAt)
        : new Date(a.createdAt) - new Date(b.createdAt)
    );

  // ---------------- Logout ----------------
  const handleLogout = () => {
    setLoggedIn(false);
    setEmail("");
    setIsAdmin(false);
    setIsPrincipal(false);
    setDepartment("");
    setSuggestions([]);
    setViewSuggestion(null);
    setNotification(null);
    if (googleButtonRef.current) googleButtonRef.current.innerHTML = "";
    showNotification("Logged out successfully", "info");
  };

  // ---------------- Render ----------------
  return (
    <>
      {/* ---------- Not Logged In ---------- */}
      {!loggedIn && (
        <>
          <header className="login-header">
            <div className="college-left">
              <img src="/ybit-logo.png" alt="College Logo" className="college-logo" />
            </div>
            <div className="ybit-center">
              <img src="/record-voice.png" alt="YBIT Logo" className="ybit-logo" />
              <div className="ybit-name">YBIT Voice</div>
            </div>
            <div className="approval-right">
              <img src="/approved-new.jpg" alt="Approved Logo" className="approval-logo" />
            </div>
          </header>
          <div className="approval-slider">
            <p>Approved by AICTE & DTE, Affiliated to Mumbai University.</p>
          </div>
          <div className="login-container">
            <div className="login-card">
              <h2 className="login-title">Student & Staff Suggestion Portal</h2>
              <p className="login-description">
                Login with your <b>@ybit.ac.in</b> email to submit suggestions and complaints.
              </p>
              {/* ===== Google Button Wrapper ===== */}
        <div className="google-btn-wrapper">
          <div ref={googleButtonRef}></div>
        </div>
              <p className="login-note">Use only your official college email address</p>
              <div className="college-link-container">
                <a href="https://ybinstitute.com/" target="_blank" rel="noopener noreferrer" className="college-link">
                  Visit YBIT Website
                </a>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ---------- Logged In ---------- */}
      {loggedIn && (
        <>
          {/* Notification Bar */}
          {notification && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                padding: "12px 0",
                backgroundColor: notification.type === "success" ? "#48bb78" : "#e53e3e",
                color: "#fff",
                textAlign: "center",
                fontWeight: "bold",
                zIndex: 10000,
              }}
            >
              {notification.message}
            </div>
          )}

          {/* Header */}
          <header className={isAdmin ? "principal-header" : "header"} style={{ marginTop: notification ? "50px" : "0" }}>
            <h1 style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
              {!isAdmin && <img src="/student-svgrepo-com.svg" alt="Student Logo" style={{ width: "35px", height: "35px" }} />}
              {isAdmin ? (isPrincipal ? "Principal Dashboard" : `${department || "Admin"} Dashboard`) : "Student Dashboard"}
            </h1>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
            <p style={{ textAlign: "center" }}>Logged in as: <b>{email}</b></p>
          </header>

          {/* Refresh Button */}
          <div style={{ textAlign: "center", margin: "15px 0" }}>
            <button className="btn refresh-btn" onClick={handleRefresh} disabled={loading}>
              {loading ? <span className="spinner"></span> : "Refresh"}
            </button>
          </div>

          {/* Suggestion Form (Students Only) */}
          {!isAdmin && (
            <div className="container">
              <div className="card">
                <h1>Submit Suggestion</h1>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const data = Object.fromEntries(new FormData(e.target).entries());
                    try {
                      const res = await fetch(`${API_BASE_URL}/api/suggestions`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, ...data }),
                      });
                      if (!res.ok) {
                        const err = await res.json();
                        showNotification(err.error || "Submit failed", "error");
                        return;
                      }
                      e.target.reset();
                      await loadSuggestions();
                      showNotification("Suggestion submitted!");
                    } catch (err) {
                      console.error(err);
                      showNotification("Submit failed. Check console.", "error");
                    }
                  }}
                >
                  <div className="form-group">
                    <label>Category</label>
                    <select name="category" required>
                      <option value="">Select Category</option>
                      <option value="academics">Academics</option>
                      <option value="facilities">Facilities</option>
                      <option value="student-life">Student Life</option>
                      <option value="technology">Technology</option>
                      <option value="safety">Safety</option>
                      <option value="administration">Administration</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Title</label>
                    <input name="title" type="text" required />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea name="description" rows="4" required></textarea>
                  </div>
                  <button type="submit" className="btn">Submit</button>
                </form>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="filters-container">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="in-progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="invalid">Invalid</option>
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">All Categories</option>
              <option value="academics">Academics</option>
              <option value="facilities">Facilities</option>
              <option value="student-life">Student Life</option>
              <option value="technology">Technology</option>
              <option value="safety">Safety</option>
              <option value="administration">Administration</option>
              <option value="other">Other</option>
            </select>
            <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>

          {/* Suggestions Table */}
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Email</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuggestions.length ? (
                  filteredSuggestions.map((s) => (
                    <tr key={s._id}>
                      <td>{s.title}</td>
                      <td>{s.category}</td>
                      <td>{(s.description || "").slice(0, 50)}{(s.description || "").length > 50 ? "..." : ""}</td>
                      <td>
                        <span className={`status ${s.status}`}>{s.status} {s.updatedBy ? `(${s.updatedBy})` : ""}</span>
                      </td>
                      <td>{s.email}</td>
                      <td>{new Date(s.createdAt).toLocaleString()}</td>
                      <td>
                        <div className="dashboard-buttons">
                          <button className="btn btn-view" onClick={() => handleView(s._id)}>View</button>
                          {isAdmin && !["resolved", "invalid"].includes(s.status) && (
                            <>
                              {s.status !== "in-progress" && <button className="btn btn-view" onClick={() => handleStatusChange(s._id, "in-progress")}>In Progress</button>}
                              <button className="btn btn-view" onClick={() => handleStatusChange(s._id, "resolved")}>Resolve</button>
                              <button className="btn btn-invalid" onClick={() => handleStatusChange(s._id, "invalid")}>Invalid</button>
                            </>
                          )}
                          {!isAdmin && <button className="btn btn-delete" onClick={() => handleDelete(s._id)}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center" }}>No suggestions found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* View Modal */}
          {viewSuggestion && (
            <div className="view-suggestion" onClick={closeView}>
              <div className="view-content" onClick={(e) => e.stopPropagation()}>
                <h2>{viewSuggestion.title}</h2>
                <p><strong>Description:</strong> {viewSuggestion.description}</p>
                <p><strong>Category:</strong> {viewSuggestion.category}</p>
                <p><strong>Status:</strong> <span className={`status ${viewSuggestion.status}`}>{viewSuggestion.status}</span></p>
                {viewSuggestion.department && <p><strong>Department:</strong> {viewSuggestion.department}</p>}
                {viewSuggestion.updatedBy && <p><strong>Updated By:</strong> {viewSuggestion.updatedBy}</p>}
                <p><strong>Submitted By:</strong> {viewSuggestion.email}</p>
                {viewSuggestion.createdAt && <p><strong>Submitted On:</strong> {new Date(viewSuggestion.createdAt).toLocaleString()}</p>}
                {viewSuggestion.updatedAt && <p><strong>Last Updated:</strong> {new Date(viewSuggestion.updatedAt).toLocaleString()}</p>}
                <div style={{ marginTop: "10px" }}>
                  <button className="btn" onClick={closeView}>Close</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default App;
